import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import {
  ActionBar,
  BackLink,
  CallLink,
  DetailRow,
  EmailLink,
  EmptyRow,
  LoadingText,
  LoadProblem,
  PanelTitle,
  TextLink,
} from '../components/Record'
import { friendlyMessage } from '../lib/backend'
import { formatPhone } from '../lib/customers'
import {
  CONTACT_ROLES,
  contactFormFor,
  contactFrom,
  contactName,
  contactPath,
  contactRoleLabel,
  emptyContactForm,
  emptyOrganizationForm,
  MANAGE_PARTNER_STRUCTURE,
  newContactPath,
  ORG_TYPES,
  organizationAddress,
  organizationFormFor,
  organizationFrom,
  orgTypeLabel,
  partnersTree,
  possibleParents,
  type Contact,
  type ContactChange,
  type ContactForm,
  type NewContact,
  type NewOrganization,
  type Organization,
  type OrganizationChange,
  type OrganizationForm,
  type PartnerBranch,
} from '../lib/partners'
import { hasPermission } from '../lib/people'
import { useBackend, useSignedInPerson } from '../lib/SessionContext'

// Partners: the organizations that send work (SERVPRO ownership groups and
// their franchises above all), other companies the business deals with, and
// the people at each. Shown as a chain: group, then franchises, then
// contacts, so a referral reads at a glance.

function useOrganizations() {
  const backend = useBackend()
  return useQuery({ queryKey: ['organizations'], queryFn: () => backend.loadOrganizations() })
}

function useContacts() {
  const backend = useBackend()
  return useQuery({ queryKey: ['contacts'], queryFn: () => backend.loadContacts() })
}

function usePartners() {
  const organizations = useOrganizations()
  const contacts = useContacts()
  return {
    organizations,
    contacts,
    isError: organizations.isError || contacts.isError,
    isPending: organizations.isPending || contacts.isPending,
    refetch: () => {
      void organizations.refetch()
      void contacts.refetch()
    },
  }
}

function PartnersFrame({ title, eyebrow, back, children }: { title: string; eyebrow?: string; back?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <>
      <BackLink to={back?.to ?? '/partners'}>{back?.label ?? 'Partners'}</BackLink>
      <PageHeader eyebrow={eyebrow} title={title} locationFilter={false} />
      {children}
    </>
  )
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export function Partners() {
  const partners = usePartners()
  const tree = partners.organizations.data && partners.contacts.data ? partnersTree(partners.organizations.data, partners.contacts.data) : null
  const counts =
    partners.organizations.data && partners.contacts.data
      ? `${partners.organizations.data.length} organizations, ${partners.contacts.data.length} contacts`
      : undefined

  return (
    <>
      <PageHeader eyebrow={counts} title="Partners" locationFilter={false} />
      <div className="page-actions">
        <Link to="/partners/new" className="button-next">
          New organization
        </Link>
        <Link to={newContactPath()} className="button-plain">
          New contact
        </Link>
      </div>
      {partners.isError ? (
        <LoadProblem what="the partners" retry={partners.refetch} />
      ) : partners.isPending || !tree ? (
        <LoadingText>Loading partners…</LoadingText>
      ) : tree.servpro.length === 0 && tree.others.length === 0 && tree.unattached.length === 0 ? (
        <section aria-label="Partners" className="panel">
          <EmptyRow>No partners yet. Add the SERVPRO ownership groups first, then their franchises.</EmptyRow>
        </section>
      ) : (
        <>
          {tree.servpro.length > 0 && (
            <section aria-labelledby="servpro-title" className="partner-group">
              <h2 id="servpro-title" className="section-title">
                SERVPRO
              </h2>
              <div className="panel tree">
                {tree.servpro.map((branch) => (
                  <TreeBranch key={branch.organization.id} branch={branch} depth={0} />
                ))}
              </div>
            </section>
          )}
          {tree.others.length > 0 && (
            <section aria-labelledby="others-title" className="partner-group">
              <h2 id="others-title" className="section-title">
                Other partners
              </h2>
              <div className="panel tree">
                {tree.others.map((branch) => (
                  <TreeBranch key={branch.organization.id} branch={branch} depth={0} />
                ))}
              </div>
            </section>
          )}
          {tree.unattached.length > 0 && (
            <section aria-labelledby="unattached-title" className="partner-group">
              <h2 id="unattached-title" className="section-title">
                Contacts without an organization
              </h2>
              <div className="panel tree">
                {tree.unattached.map((contact) => (
                  <ContactRow key={contact.id} contact={contact} depth={0} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

function TreeBranch({ branch, depth }: { branch: PartnerBranch; depth: number }) {
  const { organization } = branch
  return (
    <>
      <Link to={`/partners/${organization.id}`} className="tree-row" style={{ '--depth': depth } as React.CSSProperties}>
        <span className="list-row__main">
          <span className="list-row__title">{organization.name}</span>
          <span className="list-row__detail">{orgTypeLabel(organization.orgType)}</span>
        </span>
        <span className="list-row__aside">{organization.phone ? formatPhone(organization.phone) : ''}</span>
      </Link>
      {branch.contacts.map((contact) => (
        <ContactRow key={contact.id} contact={contact} depth={depth + 1} />
      ))}
      {branch.children.map((child) => (
        <TreeBranch key={child.organization.id} branch={child} depth={depth + 1} />
      ))}
    </>
  )
}

function ContactRow({ contact, depth }: { contact: Contact; depth: number }) {
  const role = [contact.title, contact.title ? null : contactRoleLabel(contact.contactRole)].filter(Boolean).join('')
  const phone = contact.mobile ?? contact.phone
  return (
    <Link to={contactPath(contact.id)} className="tree-row tree-row--contact" style={{ '--depth': depth } as React.CSSProperties}>
      <span className="list-row__main">
        <span className="list-row__title">{contactName(contact)}</span>
        {role && <span className="list-row__detail">{role}</span>}
      </span>
      <span className="list-row__aside">{phone ? formatPhone(phone) : ''}</span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// One organization
// ---------------------------------------------------------------------------

export function OrganizationPage() {
  const { organizationId } = useParams()
  const partners = usePartners()

  if (partners.isError) {
    return (
      <PartnersFrame title="Organization">
        <LoadProblem what="this organization" retry={partners.refetch} />
      </PartnersFrame>
    )
  }
  if (partners.isPending || !partners.organizations.data || !partners.contacts.data) {
    return (
      <PartnersFrame title="Organization">
        <LoadingText>Loading…</LoadingText>
      </PartnersFrame>
    )
  }

  const organizations = partners.organizations.data
  const organization = organizations.find((candidate) => candidate.id === organizationId)
  if (!organization) return <OrganizationNotFound />

  const parent = organizations.find((candidate) => candidate.id === organization.parentOrganizationId)
  const children = organizations.filter((candidate) => candidate.parentOrganizationId === organization.id).sort((a, b) => a.name.localeCompare(b.name))
  const contacts = partners.contacts.data
    .filter((contact) => contact.organizationId === organization.id)
    .sort((a, b) => contactName(a).localeCompare(contactName(b)))

  return (
    <PartnersFrame title={organization.name} eyebrow={orgTypeLabel(organization.orgType)}>
      <ActionBar>
        <CallLink phone={organization.phone} />
        <EmailLink email={organization.email} />
        <Link to={newContactPath(organization.id)} className="button-next">
          Add contact
        </Link>
      </ActionBar>

      <div className="record-columns">
        <div className="record-columns__main">
          <section aria-label="Contacts" className="panel">
            <PanelTitle>Contacts</PanelTitle>
            {contacts.length === 0 ? (
              <EmptyRow>No contacts yet. Add the first one with the yellow button.</EmptyRow>
            ) : (
              contacts.map((contact) => <ContactRow key={contact.id} contact={contact} depth={0} />)
            )}
          </section>
          {children.length > 0 && (
            <section aria-label="Organizations in this group" className="panel">
              <PanelTitle>{organization.orgType === 'servpro_group' ? 'Franchises' : 'Organizations in this group'}</PanelTitle>
              {children.map((child) => (
                <Link key={child.id} to={`/partners/${child.id}`} className="list-row">
                  <span className="list-row__main">
                    <span className="list-row__title">{child.name}</span>
                    <span className="list-row__detail">{orgTypeLabel(child.orgType)}</span>
                  </span>
                  <span className="list-row__aside">{child.phone ? formatPhone(child.phone) : ''}</span>
                </Link>
              ))}
            </section>
          )}
        </div>

        <section aria-label="Details" className="panel details record-columns__aside">
          <PanelTitle>Details</PanelTitle>
          <DetailRow label="Kind">{orgTypeLabel(organization.orgType)}</DetailRow>
          <DetailRow label="Part of">{parent ? <Link to={`/partners/${parent.id}`}>{parent.name}</Link> : null}</DetailRow>
          <DetailRow label="Refers jobs to us">{organization.isReferralPartner ? 'Yes' : 'No'}</DetailRow>
          <DetailRow label="Phone">{organization.phone ? formatPhone(organization.phone) : null}</DetailRow>
          <DetailRow label="Email">{organization.email}</DetailRow>
          <DetailRow label="Address">{organizationAddress(organization)}</DetailRow>
          <DetailRow label="Notes">{organization.notes}</DetailRow>
          <Link to={`/partners/${organization.id}/edit`} className="text-link details__edit">
            Edit organization
          </Link>
        </section>
      </div>
    </PartnersFrame>
  )
}

function OrganizationNotFound() {
  return (
    <PartnersFrame title="Organization not found">
      <section className="panel placeholder">
        <p>There is no organization at this address.</p>
      </section>
    </PartnersFrame>
  )
}

// ---------------------------------------------------------------------------
// New and edit organization
// ---------------------------------------------------------------------------

export function NewOrganization() {
  const organizations = useOrganizations()
  if (organizations.isError) {
    return (
      <PartnersFrame title="New organization">
        <LoadProblem what="the partners" retry={() => void organizations.refetch()} />
      </PartnersFrame>
    )
  }
  if (organizations.isPending) {
    return (
      <PartnersFrame title="New organization">
        <LoadingText>Loading…</LoadingText>
      </PartnersFrame>
    )
  }
  return <OrganizationFormPage organizations={organizations.data} organization={null} />
}

export function EditOrganization() {
  const { organizationId } = useParams()
  const organizations = useOrganizations()
  if (organizations.isError) {
    return (
      <PartnersFrame title="Edit organization">
        <LoadProblem what="this organization" retry={() => void organizations.refetch()} />
      </PartnersFrame>
    )
  }
  if (organizations.isPending) {
    return (
      <PartnersFrame title="Edit organization">
        <LoadingText>Loading…</LoadingText>
      </PartnersFrame>
    )
  }
  const organization = organizations.data.find((candidate) => candidate.id === organizationId)
  if (!organization) return <OrganizationNotFound />
  return <OrganizationFormPage key={organization.id} organizations={organizations.data} organization={organization} />
}

function OrganizationFormPage({ organizations, organization }: { organizations: Organization[]; organization: Organization | null }) {
  const backend = useBackend()
  const me = useSignedInPerson()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<OrganizationForm>(() => (organization ? organizationFormFor(organization) : { ...emptyOrganizationForm }))
  const [error, setError] = useState<string | null>(null)
  // Anyone can add an organization and set its place in the chain. Changing
  // that place later is for Project managers and Admins.
  const structureLocked = organization !== null && !hasPermission(me, MANAGE_PARTNER_STRUCTURE)
  const parents = possibleParents(organizations, organization?.id ?? null)

  const save = useMutation({
    mutationFn: async (saved: NewOrganization) => {
      if (organization) {
        const change: OrganizationChange = { ...saved, organizationId: organization.id }
        await backend.updateOrganization(change)
        return organization.id
      }
      const { organizationId } = await backend.addOrganization(saved)
      return organizationId
    },
    onSuccess: async (organizationId) => {
      await queryClient.invalidateQueries({ queryKey: ['organizations'] })
      navigate(`/partners/${organizationId}`)
    },
    onError: (caught) => setError(friendlyMessage(caught, 'Could not save. Check the connection and try again.')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = organizationFrom(form, organization?.id ?? null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    save.mutate(result.organization)
  }

  const back = organization ? { to: `/partners/${organization.id}`, label: organization.name } : undefined

  return (
    <PartnersFrame title={organization ? organization.name : 'New organization'} eyebrow={organization ? 'Edit organization' : undefined} back={back}>
      <form className="panel form form--panel" onSubmit={onSubmit} noValidate>
        <label className="field">
          Name
          <input type="text" autoComplete="off" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>

        <label className="field">
          Kind
          <select
            value={form.orgType}
            disabled={structureLocked}
            onChange={(event) => setForm({ ...form, orgType: event.target.value as OrganizationForm['orgType'] })}
          >
            <option value="">Pick one</option>
            {ORG_TYPES.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Part of <span className="field__optional">(the ownership group or parent company, if any)</span></span>
          <select
            value={form.parentOrganizationId}
            disabled={structureLocked}
            onChange={(event) => setForm({ ...form, parentOrganizationId: event.target.value })}
          >
            <option value="">None</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
        </label>
        {structureLocked && <p className="field__hint">Only a Project manager or Admin can change the kind or the parent.</p>}

        <label className="check">
          <input
            type="checkbox"
            checked={form.isReferralPartner}
            onChange={(event) => setForm({ ...form, isReferralPartner: event.target.checked })}
          />
          Refers jobs to us
        </label>

        <div className="form__row">
          <label className="field">
            <span>Phone <span className="field__optional">(optional)</span></span>
            <input type="tel" autoComplete="off" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <label className="field">
            <span>Email <span className="field__optional">(optional)</span></span>
            <input
              type="email"
              autoComplete="off"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
        </div>

        <fieldset className="field-group field-group--spaced">
          <legend>Address (optional)</legend>
          <label className="field">
            Street address
            <input type="text" autoComplete="off" value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} />
          </label>
          <label className="field">
            City
            <input type="text" autoComplete="off" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <div className="form__row form__row--short">
            <label className="field">
              State
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={2}
                placeholder="PA"
                value={form.state}
                onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })}
              />
            </label>
            <label className="field">
              ZIP
              <input type="text" autoComplete="off" inputMode="numeric" value={form.zip} onChange={(event) => setForm({ ...form, zip: event.target.value })} />
            </label>
          </div>
        </fieldset>

        <label className="field">
          <span>Notes <span className="field__optional">(optional)</span></span>
          <textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="submit" className="button-next" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : organization ? 'Save changes' : 'Save organization'}
          </button>
          <Link to={organization ? `/partners/${organization.id}` : '/partners'} className="text-link">
            Cancel
          </Link>
        </div>
      </form>
    </PartnersFrame>
  )
}

// ---------------------------------------------------------------------------
// Contacts: a new one, or an existing one (its page is its form)
// ---------------------------------------------------------------------------

export function NewContactPage() {
  const [params] = useSearchParams()
  const organizations = useOrganizations()
  if (organizations.isError) {
    return (
      <PartnersFrame title="New contact">
        <LoadProblem what="the partners" retry={() => void organizations.refetch()} />
      </PartnersFrame>
    )
  }
  if (organizations.isPending) {
    return (
      <PartnersFrame title="New contact">
        <LoadingText>Loading…</LoadingText>
      </PartnersFrame>
    )
  }
  return <ContactFormPage organizations={organizations.data} contact={null} startingOrganizationId={params.get('organization') ?? ''} />
}

export function ContactPage() {
  const { contactId } = useParams()
  const partners = usePartners()
  if (partners.isError) {
    return (
      <PartnersFrame title="Contact">
        <LoadProblem what="this contact" retry={partners.refetch} />
      </PartnersFrame>
    )
  }
  if (partners.isPending || !partners.organizations.data || !partners.contacts.data) {
    return (
      <PartnersFrame title="Contact">
        <LoadingText>Loading…</LoadingText>
      </PartnersFrame>
    )
  }
  const contact = partners.contacts.data.find((candidate) => candidate.id === contactId)
  if (!contact) {
    return (
      <PartnersFrame title="Contact not found">
        <section className="panel placeholder">
          <p>There is no contact at this address.</p>
        </section>
      </PartnersFrame>
    )
  }
  return <ContactFormPage key={contact.id} organizations={partners.organizations.data} contact={contact} startingOrganizationId="" />
}

function ContactFormPage({
  organizations,
  contact,
  startingOrganizationId,
}: {
  organizations: Organization[]
  contact: Contact | null
  startingOrganizationId: string
}) {
  const backend = useBackend()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<ContactForm>(() =>
    contact ? contactFormFor(contact) : { ...emptyContactForm, organizationId: startingOrganizationId },
  )
  const [error, setError] = useState<string | null>(null)
  const organization = organizations.find((candidate) => candidate.id === (contact?.organizationId ?? startingOrganizationId))
  const sorted = [...organizations].sort((a, b) => a.name.localeCompare(b.name))

  const save = useMutation({
    mutationFn: async (saved: NewContact) => {
      if (contact) {
        const change: ContactChange = { ...saved, contactId: contact.id }
        await backend.updateContact(change)
      } else {
        await backend.addContact(saved)
      }
      return saved.organizationId
    },
    onSuccess: async (organizationId) => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate(organizationId ? `/partners/${organizationId}` : '/partners')
    },
    onError: (caught) => setError(friendlyMessage(caught, 'Could not save. Check the connection and try again.')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = contactFrom(form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    save.mutate(result.contact)
  }

  const back = organization ? { to: `/partners/${organization.id}`, label: organization.name } : undefined
  const cancelTo = organization ? `/partners/${organization.id}` : '/partners'

  return (
    <PartnersFrame
      title={contact ? contactName(contact) : 'New contact'}
      eyebrow={contact ? [contact.title, organization?.name].filter(Boolean).join(' · ') || 'Contact' : organization?.name}
      back={back}
    >
      {contact && (contact.mobile || contact.phone || contact.email) && (
        <ActionBar>
          <CallLink phone={contact.mobile ?? contact.phone} />
          <TextLink phone={contact.mobile} />
          <EmailLink email={contact.email} />
        </ActionBar>
      )}
      <form className="panel form form--panel" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="field">
            First name
            <input type="text" autoComplete="off" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          </label>
          <label className="field">
            Last name
            <input type="text" autoComplete="off" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          </label>
        </div>

        <label className="field">
          Organization
          <select value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })}>
            <option value="">None</option>
            {sorted.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>

        <div className="form__row">
          <label className="field">
            <span>Title <span className="field__optional">(optional)</span></span>
            <input type="text" autoComplete="off" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label className="field">
            Role
            <select value={form.contactRole} onChange={(event) => setForm({ ...form, contactRole: event.target.value as ContactForm['contactRole'] })}>
              <option value="">Not said</option>
              {CONTACT_ROLES.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form__row">
          <label className="field">
            <span>Mobile <span className="field__optional">(optional)</span></span>
            <input type="tel" autoComplete="off" inputMode="tel" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} />
          </label>
          <label className="field">
            <span>Office phone <span className="field__optional">(optional)</span></span>
            <input type="tel" autoComplete="off" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
        </div>

        <label className="field">
          <span>Email <span className="field__optional">(optional)</span></span>
          <input
            type="email"
            autoComplete="off"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Notes <span className="field__optional">(optional)</span></span>
          <textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="submit" className="button-next" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : contact ? 'Save changes' : 'Save contact'}
          </button>
          <Link to={cancelTo} className="text-link">
            Cancel
          </Link>
        </div>
      </form>
    </PartnersFrame>
  )
}
