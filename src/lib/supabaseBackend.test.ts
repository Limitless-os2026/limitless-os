import { readSupabaseSettings } from './supabaseBackend'

describe('Supabase settings', () => {
  it('reads the address and public key', () => {
    expect(readSupabaseSettings({ VITE_SUPABASE_URL: ' https://example.supabase.co ', VITE_SUPABASE_KEY: 'public-key' })).toEqual({
      url: 'https://example.supabase.co',
      key: 'public-key',
    })
  })

  it('is missing when either value is empty or absent', () => {
    expect(readSupabaseSettings({})).toBeNull()
    expect(readSupabaseSettings({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_KEY: '' })).toBeNull()
    expect(readSupabaseSettings({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_KEY: 'public-key' })).toBeNull()
  })
})
