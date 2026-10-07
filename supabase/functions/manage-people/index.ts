// The manage-people server function: an Admin adds a person, or gives
// someone a new temporary password. Runs on Supabase, never in the browser,
// because creating sign-in accounts needs the secret key. The secret key is
// read here from Supabase's own settings and never sent back.
//
// Before doing anything it checks, with the caller's own sign-in, that they
// are an active person with the manage_users permission (Admins). Changes
// to the profile are then made as the caller, so the access rules apply and
// the audit trail records who made them.
//
// No email is sent. The temporary password is returned once, for the Admin
// to pass on, and the person must choose their own when they first sign in.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { generateTemporaryPassword, parsePeopleRequest } from './rules.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function setting(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`The ${name} setting is missing.`)
  return value
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' })

  try {
    return await handle(request)
  } catch (caught) {
    console.error(caught)
    return reply(500, { error: 'Something went wrong on the server. Try again.' })
  }
})

async function handle(request: Request): Promise<Response> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'Sign in first.' })

  const url = setting('SUPABASE_URL')
  const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

  // The caller, with their own sign-in: everything they do through this
  // client goes through the access rules.
  const asCaller = createClient(url, setting('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: noSession,
  })

  const token = authorization.slice('Bearer '.length)
  const { data: who, error: whoError } = await asCaller.auth.getUser(token)
  if (whoError || !who.user) return reply(401, { error: 'Sign in first.' })

  // Active, password already chosen, and allowed to manage people.
  const { data: allowed, error: allowedError } = await asCaller.rpc('has_permission', { permission: 'manage_users' })
  if (allowedError) throw allowedError
  if (allowed !== true) return reply(403, { error: 'Only an Admin can do this.' })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: 'The request was empty.' })
  }
  const parsed = parsePeopleRequest(body)
  if ('error' in parsed) return reply(400, { error: parsed.error })
  const people = parsed.request

  // Only now, with the caller checked, is the secret key used.
  const withSecretKey = createClient(url, setting('SUPABASE_SERVICE_ROLE_KEY'), { auth: noSession })

  if (people.action === 'reset_password') {
    const { data: person, error } = await asCaller.from('profiles').select('id').eq('id', people.personId).maybeSingle()
    if (error) throw error
    if (!person) return reply(404, { error: 'That person was not found.' })

    const temporaryPassword = generateTemporaryPassword()
    const { error: resetError } = await withSecretKey.auth.admin.updateUserById(people.personId, {
      password: temporaryPassword,
    })
    if (resetError) throw resetError
    await requirePasswordChange(asCaller, people.personId)
    return reply(200, { personId: people.personId, temporaryPassword })
  }

  // Adding someone. Check the role and offices first, so a bad choice never
  // leaves a half-made account behind.
  const { data: role, error: roleError } = await asCaller.from('roles').select('id').eq('id', people.roleId).maybeSingle()
  if (roleError) throw roleError
  if (!role) return reply(400, { error: 'Pick a role.' })

  const { data: offices, error: officeError } = await asCaller
    .from('offices')
    .select('id')
    .in('id', people.officeIds)
    .eq('is_active', true)
  if (officeError) throw officeError
  if ((offices ?? []).length !== people.officeIds.length) return reply(400, { error: 'Pick their offices again.' })

  const temporaryPassword = generateTemporaryPassword()
  const { data: created, error: createError } = await withSecretKey.auth.admin.createUser({
    email: people.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { first_name: people.firstName, last_name: people.lastName },
  })
  if (createError || !created.user) {
    if (createError?.code === 'email_exists' || createError?.code === 'user_already_exists') {
      return reply(409, { error: 'Someone with that email can already sign in.' })
    }
    throw createError ?? new Error('No account came back.')
  }
  const personId = created.user.id

  // The database made the profile as Sales with no office. Set it up as the
  // Admin chose, as the Admin.
  try {
    const { error: setUpError } = await asCaller.rpc('update_person', {
      person_id: personId,
      first_name: people.firstName,
      last_name: people.lastName,
      role_id: people.roleId,
      office_ids: people.officeIds,
      primary_office_id: people.primaryOfficeId,
      is_active: true,
    })
    if (setUpError) throw setUpError
    await requirePasswordChange(asCaller, personId)
  } catch (caught) {
    console.error(caught)
    return reply(500, {
      error:
        'Their sign-in was made, but setting it up did not finish. Open them on the People screen, check their role and offices, and use Reset password to get a temporary password.',
    })
  }

  return reply(200, { personId, temporaryPassword })
}

async function requirePasswordChange(asCaller: SupabaseClient, personId: string): Promise<void> {
  const { error } = await asCaller.rpc('require_password_change', { person_id: personId })
  if (error) throw error
}
