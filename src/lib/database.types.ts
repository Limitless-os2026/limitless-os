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

export type CustomersRow = StandardColumns & {
  customer_type: 'person' | 'company'
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string
  /** Digits only, kept by the database. */
  phone_digits: string
  phone_alt: string | null
  email: string | null
  preferred_contact: 'call' | 'text' | 'email' | null
  billing_address_line1: string | null
  billing_address_line2: string | null
  billing_city: string | null
  billing_state: string | null
  billing_zip: string | null
  office_id: string
  notes: string | null
  external_source: string | null
  external_id: string | null
  archived_at: string | null
}

export type PropertiesRow = StandardColumns & {
  customer_id: string
  address_line1: string
  address_line2: string | null
  city: string | null
  state: string | null
  zip: string | null
  county: string | null
  latitude: number | null
  longitude: number | null
  property_type: 'residential' | 'commercial' | 'multi_family' | null
  notes: string | null
  external_source: string | null
  external_id: string | null
  archived_at: string | null
}

export type OrganizationsRow = StandardColumns & {
  name: string
  org_type:
    | 'servpro_group'
    | 'servpro_franchise'
    | 'restoration_company'
    | 'insurance_carrier'
    | 'mortgage_company'
    | 'property_manager'
    | 'supplier'
    | 'subcontractor'
    | 'vendor'
    | 'other'
  parent_organization_id: string | null
  is_referral_partner: boolean
  relationship_owner_id: string | null
  phone: string | null
  email: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  external_source: string | null
  external_id: string | null
  archived_at: string | null
}

export type ContactsRow = StandardColumns & {
  organization_id: string | null
  first_name: string | null
  last_name: string | null
  title: string | null
  contact_role:
    | 'owner'
    | 'general_manager'
    | 'mitigation_manager'
    | 'project_manager'
    | 'dispatcher'
    | 'estimator'
    | 'office_manager'
    | 'adjuster'
    | 'agent'
    | 'other'
    | null
  phone: string | null
  mobile: string | null
  email: string | null
  notes: string | null
  external_source: string | null
  external_id: string | null
  archived_at: string | null
}

/** What customers_with_phone gives back: enough for the duplicate warning, nothing more. */
export type PhoneMatchRow = {
  customer_id: string
  display_name: string
  office_name: string
  can_open: boolean
}

export type SearchRow = {
  kind: string
  id: string
  title: string
  detail: string | null
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
      customers: Table<CustomersRow, Omit<CustomersRow, 'phone_digits'>>
      properties: Table<PropertiesRow>
      organizations: Table<OrganizationsRow>
      contacts: Table<ContactsRow>
    }
    Views: { [_ in never]: never }
    Functions: {
      has_permission: { Args: { permission: string }; Returns: boolean }
      is_active_staff: { Args: Record<PropertyKey, never>; Returns: boolean }
      in_my_offices: { Args: { office: string }; Returns: boolean }
      can_manage_team: { Args: { team: string }; Returns: boolean }
      my_scope: { Args: Record<PropertyKey, never>; Returns: RoleScope | null }
      office_in_my_scope: { Args: { office: string }; Returns: boolean }
      can_see_customer: { Args: { customer: string; office: string; creator: string | null }; Returns: boolean }
      audit_entry_in_my_scope: { Args: { table_name: string; record_id: string; changes: Json }; Returns: boolean }
      phone_key: { Args: { phone: string }; Returns: string }
      customers_with_phone: { Args: { phone: string }; Returns: PhoneMatchRow[] }
      add_customer: {
        Args: {
          customer_type: string
          first_name: string | null
          last_name: string | null
          company_name: string | null
          phone: string
          email: string | null
          office_id: string
          property_address_line1?: string | null
          property_address_line2?: string | null
          property_city?: string | null
          property_state?: string | null
          property_zip?: string | null
          property_type?: string | null
        }
        Returns: string
      }
      search_records: { Args: { query: string }; Returns: SearchRow[] }
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
