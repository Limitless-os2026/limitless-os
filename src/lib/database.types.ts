// Types for the database tables the app reads, in the shape `supabase gen types
// typescript` produces. Written by hand from supabase/migrations/ for now.
// Regenerate with the Supabase CLI once it is set up, and keep this file in
// step with the migrations until then. These are `type`s, not `interface`s,
// because the Supabase client needs them to work as plain records.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type StandardColumns = {
  id: string
  created_at: string
  updated_at: string
  created_by: string | null
}

type Insert<Row> = Partial<Row>

type Table<Row, Writable = Row> = {
  Row: Row
  Insert: Insert<Writable>
  Update: Partial<Writable>
  Relationships: []
}

export type StatesRow = StandardColumns & {
  code: string
  name: string
  is_active: boolean
}

export type OfficesRow = StandardColumns & {
  state_id: string
  name: string
  time_zone: string
  phone: string | null
  address_line1: string | null
  city: string | null
  zip: string | null
  is_active: boolean
}

export type TeamsRow = StandardColumns & {
  office_id: string
  name: string
  team_type: 'sales' | 'production' | 'ems_crew' | 'office'
  is_active: boolean
}

export type RoleScope = 'company' | 'state' | 'office' | 'own'

export type RolesRow = StandardColumns & {
  key: string
  name: string
  scope: RoleScope
}

export type RolePermissionsRow = StandardColumns & {
  role_id: string
  permission_key: string
}

export type ProfilesRow = StandardColumns & {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  role_id: string
  primary_office_id: string | null
  is_active: boolean
  must_change_password: boolean
}

export type ProfileOfficesRow = StandardColumns & {
  profile_id: string
  office_id: string
}

export type TeamMembersRow = StandardColumns & {
  team_id: string
  profile_id: string
  is_lead: boolean
}

export type AuditLogRow = StandardColumns & {
  table_name: string
  record_id: string
  action: 'insert' | 'update' | 'delete'
  changes: Json
  changed_by: string | null
  changed_at: string
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      states: Table<StatesRow>
      offices: Table<OfficesRow>
      teams: Table<TeamsRow>
      roles: Table<RolesRow>
      role_permissions: Table<RolePermissionsRow>
      profiles: Table<ProfilesRow>
      profile_offices: Table<ProfileOfficesRow>
      team_members: Table<TeamMembersRow>
      audit_log: Table<AuditLogRow>
    }
    Views: { [_ in never]: never }
    Functions: {
      has_permission: { Args: { permission: string }; Returns: boolean }
      is_active_staff: { Args: Record<PropertyKey, never>; Returns: boolean }
      in_my_offices: { Args: { office: string }; Returns: boolean }
      can_manage_team: { Args: { team: string }; Returns: boolean }
      require_password_change: { Args: { person_id: string }; Returns: undefined }
      update_my_details: {
        Args: { first_name: string; last_name: string; phone: string }
        Returns: undefined
      }
      update_person: {
        Args: {
          person_id: string
          first_name: string
          last_name: string
          role_id: string
          office_ids: string[]
          primary_office_id: string | null
          is_active: boolean
        }
        Returns: undefined
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
