import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
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
import {
  customerChangeFrom,
  customerFormFor,
  customerName,
  customerOfficeLabel,
  defaultOfficeForNewCustomer,
  duplicateWarning,
  emptyPropertyForm,
  formatPhone,
  isPhoneComplete,
  newCustomerFrom,
  newPropertyFrom,
  officesForNewCustomer,
  phoneKey,
  preferredContactLabel,
  PREFERRED_CONTACTS,
  propertyAddress,
  PROPERTY_TYPES,
  propertyTypeLabel,
  sortCustomers,
  type Customer,
  type CustomerChange,
  type CustomerForm,
  type CustomerType,
  type NewCustomer,
  type NewCustomerForm,
  type NewProperty,
  type Property,
  type PropertyForm,
} from '../lib/customers'
import { useLocationFilter, useLocations } from '../lib/LocationContext'
import { coversOffice, type Locations } from '../lib/locations'
import { useBackend, useSignedInPerson } from '../lib/SessionContext'

// Customers and their properties. A customer needs only a name and a phone
// number. The New customer form warns when the phone number already belongs
// to someone, and offers to open that customer instead.

function useCustomers() {
  const backend = useBackend()
  return useQuery({ queryKey: ['customers'], queryFn: () => backend.loadCustomers() })
}

function useCustomer(customerId: string | undefined) {
  const backend = useBackend()
  return useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => backend.loadCustomer(customerId ?? ''),
    enabled: Boolean(customerId),
  })
}

function useProperties(customerId?: string) {
  const backend = useBackend()
  return useQuery({ queryKey: ['properties', customerId ?? 'all'], queryFn: () => backend.loadProperties(customerId) })
}

/** A value that settles a moment after typing stops. */
function useSettled<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return settled
}

const addedOn = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export function Customers() {
  const customers = useCustomers()
  const properties = useProperties()
  const locations = useLocations()
  const { location } = useLocationFilter()

  const shown =
    customers.data && locations.data
      ? sortCustomers(customers.data).filter((customer) => inLocation(customer, location, locations.data))
      : []

  return (
    <>
      <PageHeader
        eyebrow={customers.data && locations.data ? countOf(shown.length, 'customer') : undefined}
        title="Customers"
      />
      <div className="page-actions">
        <Link to="/customers/new" className="button-next">
          New customer
        </Link>
      </div>
      {customers.isError || locations.isError ? (
        <LoadProblem
          what="the customer list"
          retry={() => {
            void customers.refetch()
            void locations.refetch()
          }}
        />
      ) : customers.isPending || locations.isPending ? (
        <LoadingText>Loading customers…</LoadingText>
      ) : shown.length === 0 ? (
        <section aria-label="Customers" className="panel">
          <EmptyRow>
            {customers.data.length === 0 ? 'No customers yet. Add the first one.' : 'No customers in this location yet.'}
          </EmptyRow>
        </section>
      ) : (
        <section aria-label="Customers" className="panel">
          {shown.map((customer) => {
            const first = properties.data?.find((property) => property.customerId === customer.id)
            return (
              <Link key={customer.id} to={`/customers/${customer.id}`} className="list-row">
                <span className="list-row__main">
                  <span className="list-row__title">{customerName(customer)}</span>
                  <span className="list-row__detail">
                    {first ? propertyAddress(first) : customerOfficeLabel(customer, locations.data.offices, locations.data.states)}
                  </span>
                </span>
                <span className="list-row__aside">{formatPhone(customer.phone)}</span>
              </Link>
            )
          })}
        </section>
      )}
    </>
  )
}

function inLocation(customer: Customer, location: string, locations: Locations): boolean {
  const office = locations.offices.find((candidate) => candidate.id === customer.officeId)
  if (!office) return location === 'all'
  const state = locations.states.find((candidate) => candidate.id === office.stateId)
  return state ? coversOffice(location, state.code, office.id) : location === 'all'
}

function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

// ---------------------------------------------------------------------------
// One customer
// ---------------------------------------------------------------------------

export function CustomerPage() {
  const { customerId } = useParams()
  const customer = useCustomer(customerId)
  const properties = useProperties(customerId)
  const locations = useLocations()

  if (customer.isError) {
    return (
      <>
        <BackLink to="/customers">Customers</BackLink>
        <PageHeader title="Customer" locationFilter={false} />
        <LoadProblem what="this customer" retry={() => void customer.refetch()} />
      </>
    )
  }
  if (customer.isPending) {
    return (
      <>
        <BackLink to="/customers">Customers</BackLink>
        <PageHeader title="Customer" locationFilter={false} />
        <LoadingText>Loading…</LoadingText>
      </>
    )
  }
  if (!customer.data) return <CustomerNotFound />

  const found = customer.data
  const office = locations.data ? customerOfficeLabel(found, locations.data.offices, locations.data.states) : ''

  return (
    <>
      <BackLink to="/customers">Customers</BackLink>
      <PageHeader eyebrow={office ? `Customer · ${office}` : 'Customer'} title={customerName(found)} locationFilter={false} />
      <ActionBar>
        <CallLink phone={found.phone} />
        <TextLink phone={found.phone} />
        <EmailLink email={found.email} />
        <Link to={`/customers/${found.id}/properties/new`} className="button-next">
          Add property
        </Link>
      </ActionBar>

      <div className="record-columns">
        <section aria-label="Properties" className="panel record-columns__main">
          <PanelTitle>Properties</PanelTitle>
          {properties.isError ? (
            <EmptyRow>Could not load the properties. Check the connection and try again.</EmptyRow>
          ) : properties.isPending ? (
            <EmptyRow>Loading…</EmptyRow>
          ) : properties.data.length === 0 ? (
            <EmptyRow>No properties yet. Add the first one with the yellow button.</EmptyRow>
          ) : (
            properties.data.map((property) => <PropertyRow key={property.id} property={property} />)
          )}
        </section>

        <section aria-label="Details" className="panel details record-columns__aside">
          <PanelTitle>Details</PanelTitle>
          <DetailRow label="Phone">{formatPhone(found.phone)}</DetailRow>
          <DetailRow label="Other phone">{found.phoneAlt ? formatPhone(found.phoneAlt) : null}</DetailRow>
          <DetailRow label="Email">{found.email}</DetailRow>
          <DetailRow label="Prefers">{preferredContactLabel(found.preferredContact)}</DetailRow>
          {found.customerType === 'company' && (found.firstName || found.lastName) && (
            <DetailRow label="Contact">{[found.firstName, found.lastName].filter(Boolean).join(' ')}</DetailRow>
          )}
          <DetailRow label="Notes">{found.notes}</DetailRow>
          <DetailRow label="Added">{addedOn.format(new Date(found.createdAt))}</DetailRow>
          <Link to={`/customers/${found.id}/edit`} className="text-link details__edit">
            Edit details
          </Link>
        </section>
      </div>
    </>
  )
}

function PropertyRow({ property }: { property: Property }) {
  return (
    <div className="list-row">
      <span className="list-row__main">
        <span className="list-row__title">{propertyAddress(property)}</span>
        {property.notes && <span className="list-row__detail">{property.notes}</span>}
      </span>
      <span className="list-row__aside">{propertyTypeLabel(property.propertyType)}</span>
    </div>
  )
}

function CustomerNotFound() {
  return (
    <>
      <BackLink to="/customers">Customers</BackLink>
      <PageHeader title="Customer not found" locationFilter={false} />
      <section className="panel placeholder">
        <p>There is no customer at this address, or it is not one you can see.</p>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// New customer
// ---------------------------------------------------------------------------

export function NewCustomer() {
  const locations = useLocations()
  if (locations.isError) {
    return (
      <>
        <BackLink to="/customers">Customers</BackLink>
        <PageHeader title="New customer" locationFilter={false} />
        <LoadProblem what="the offices" retry={() => void locations.refetch()} />
      </>
    )
  }
  if (locations.isPending) {
    return (
      <>
        <BackLink to="/customers">Customers</BackLink>
        <PageHeader title="New customer" locationFilter={false} />
        <LoadingText>Loading…</LoadingText>
      </>
    )
  }
  return <NewCustomerForm locations={locations.data} />
}

function NewCustomerForm({ locations }: { locations: Locations }) {
  const backend = useBackend()
  const me = useSignedInPerson()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { location } = useLocationFilter()
  const offices = officesForNewCustomer(me, locations.offices)
  const [form, setForm] = useState<NewCustomerForm>({
    customerType: 'person',
    firstName: '',
    lastName: '',
    companyName: '',
    phone: '',
    email: '',
    officeId: defaultOfficeForNewCustomer(offices, locations.states, location),
    property: { ...emptyPropertyForm },
  })
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (customer: NewCustomer) => backend.addCustomer(customer),
    onSuccess: async ({ customerId }) => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] })
      await queryClient.invalidateQueries({ queryKey: ['properties'] })
      navigate(`/customers/${customerId}`)
    },
    onError: (caught) => setError(friendlyMessage(caught, 'Could not save the customer. Check the connection and try again.')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = newCustomerFrom(form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    save.mutate(result.customer)
  }

  if (offices.length === 0) {
    return (
      <>
        <BackLink to="/customers">Customers</BackLink>
        <PageHeader title="New customer" locationFilter={false} />
        <section className="panel placeholder">
          <h2 className="placeholder__title">You are not in an office yet</h2>
          <p>A customer belongs to an office, so ask an Admin to add you to yours first.</p>
        </section>
      </>
    )
  }

  return (
    <>
      <BackLink to="/customers">Customers</BackLink>
      <PageHeader title="New customer" locationFilter={false} />
      <form className="panel form form--panel" onSubmit={onSubmit} noValidate>
        <CustomerTypeChoice value={form.customerType} onChange={(customerType) => setForm({ ...form, customerType })} />
        <NameFields form={form} onChange={(changes) => setForm({ ...form, ...changes })} />

        <label className="field">
          Phone
          <input
            type="tel"
            autoComplete="off"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </label>
        <DuplicateWarning phone={form.phone} />

        {offices.length > 1 && (
          <label className="field">
            Office
            <select value={form.officeId} onChange={(event) => setForm({ ...form, officeId: event.target.value })}>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {customerOfficeLabel({ officeId: office.id }, locations.offices, locations.states)}
                </option>
              ))}
            </select>
          </label>
        )}

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

        <PropertyFields
          legend="Property address (optional)"
          form={form.property}
          onChange={(property) => setForm({ ...form, property })}
        />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="submit" className="button-next" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save customer'}
          </button>
          <Link to="/customers" className="text-link">
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}

function CustomerTypeChoice({ value, onChange }: { value: CustomerType; onChange: (value: CustomerType) => void }) {
  return (
    <div role="group" aria-label="Customer type" className="segmented">
      <button type="button" aria-pressed={value === 'person'} onClick={() => onChange('person')}>
        Person
      </button>
      <button type="button" aria-pressed={value === 'company'} onClick={() => onChange('company')}>
        Company
      </button>
    </div>
  )
}

function NameFields({
  form,
  onChange,
}: {
  form: Pick<NewCustomerForm, 'customerType' | 'firstName' | 'lastName' | 'companyName'>
  onChange: (changes: Partial<Pick<NewCustomerForm, 'firstName' | 'lastName' | 'companyName'>>) => void
}) {
  if (form.customerType === 'company') {
    return (
      <>
        <label className="field">
          Company name
          <input type="text" autoComplete="off" value={form.companyName} onChange={(event) => onChange({ companyName: event.target.value })} />
        </label>
        <div className="form__row">
          <label className="field">
            <span>Contact first name <span className="field__optional">(optional)</span></span>
            <input type="text" autoComplete="off" value={form.firstName} onChange={(event) => onChange({ firstName: event.target.value })} />
          </label>
          <label className="field">
            <span>Contact last name <span className="field__optional">(optional)</span></span>
            <input type="text" autoComplete="off" value={form.lastName} onChange={(event) => onChange({ lastName: event.target.value })} />
          </label>
        </div>
      </>
    )
  }
  return (
    <div className="form__row">
      <label className="field">
        First name
        <input type="text" autoComplete="off" value={form.firstName} onChange={(event) => onChange({ firstName: event.target.value })} />
      </label>
      <label className="field">
        <span>Last name <span className="field__optional">(optional)</span></span>
        <input type="text" autoComplete="off" value={form.lastName} onChange={(event) => onChange({ lastName: event.target.value })} />
      </label>
    </div>
  )
}

// Looks up the phone number a moment after typing stops. When it already
// belongs to someone, says who and offers to open them instead.
function DuplicateWarning({ phone, except }: { phone: string; except?: string }) {
  const backend = useBackend()
  const settled = useSettled(phone)
  const key = phoneKey(settled)
  const complete = isPhoneComplete(settled)
  const lookup = useQuery({
    queryKey: ['customers-with-phone', key],
    queryFn: () => backend.findCustomersByPhone(settled),
    enabled: complete,
    staleTime: 30_000,
  })
  const matches = (lookup.data ?? []).filter((match) => except === undefined || match.customerId !== except)
  const warning = complete ? duplicateWarning(matches) : null
  if (!warning) return null

  return (
    <div role="status" className="notice">
      <p className="notice__text">{warning}</p>
      {matches.map((match, index) =>
        match.canOpen && match.customerId ? (
          <Link key={match.customerId} to={`/customers/${match.customerId}`} className="text-link">
            Open {match.displayName} instead
          </Link>
        ) : match.archived ? (
          <p key={`archived-${index}`} className="notice__muted">
            {match.displayName} is archived. Ask a Project manager in the {match.officeName} office to bring them back instead of adding them again.
          </p>
        ) : (
          <p key={`hidden-${index}`} className="notice__muted">
            You cannot open {match.displayName}. Ask a Project manager in the {match.officeName} office before adding them again.
          </p>
        ),
      )}
    </div>
  )
}

function PropertyFields({ legend, form, onChange }: { legend: string; form: PropertyForm; onChange: (form: PropertyForm) => void }) {
  return (
    <fieldset className="field-group field-group--spaced">
      <legend>{legend}</legend>
      <label className="field">
        Street address
        <input type="text" autoComplete="off" value={form.addressLine1} onChange={(event) => onChange({ ...form, addressLine1: event.target.value })} />
      </label>
      <label className="field">
        <span>Apartment or unit <span className="field__optional">(optional)</span></span>
        <input type="text" autoComplete="off" value={form.addressLine2} onChange={(event) => onChange({ ...form, addressLine2: event.target.value })} />
      </label>
      <label className="field">
        City
        <input type="text" autoComplete="off" value={form.city} onChange={(event) => onChange({ ...form, city: event.target.value })} />
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
            onChange={(event) => onChange({ ...form, state: event.target.value.toUpperCase() })}
          />
        </label>
        <label className="field">
          ZIP
          <input type="text" autoComplete="off" inputMode="numeric" value={form.zip} onChange={(event) => onChange({ ...form, zip: event.target.value })} />
        </label>
      </div>
      <label className="field">
        Property type
        <select value={form.propertyType} onChange={(event) => onChange({ ...form, propertyType: event.target.value as PropertyForm['propertyType'] })}>
          {PROPERTY_TYPES.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Edit customer
// ---------------------------------------------------------------------------

export function EditCustomer() {
  const { customerId } = useParams()
  const customer = useCustomer(customerId)

  if (customer.isError) {
    return (
      <>
        <BackLink to={`/customers/${customerId}`}>Customer</BackLink>
        <PageHeader title="Edit customer" locationFilter={false} />
        <LoadProblem what="this customer" retry={() => void customer.refetch()} />
      </>
    )
  }
  if (customer.isPending) {
    return (
      <>
        <BackLink to={`/customers/${customerId}`}>Customer</BackLink>
        <PageHeader title="Edit customer" locationFilter={false} />
        <LoadingText>Loading…</LoadingText>
      </>
    )
  }
  if (!customer.data) return <CustomerNotFound />
  return <EditCustomerForm key={customer.data.id} customer={customer.data} />
}

function EditCustomerForm({ customer }: { customer: Customer }) {
  const backend = useBackend()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<CustomerForm>(() => customerFormFor(customer))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (change: CustomerChange) => backend.updateCustomer(change),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] })
      await queryClient.invalidateQueries({ queryKey: ['customer', customer.id] })
      navigate(`/customers/${customer.id}`)
    },
    onError: (caught) => setError(friendlyMessage(caught, 'Could not save. Check the connection and try again.')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = customerChangeFrom(customer.id, form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    save.mutate(result.change)
  }

  return (
    <>
      <BackLink to={`/customers/${customer.id}`}>{customerName(customer)}</BackLink>
      <PageHeader eyebrow="Edit customer" title={customerName(customer)} locationFilter={false} />
      <form className="panel form form--panel" onSubmit={onSubmit} noValidate>
        <CustomerTypeChoice value={form.customerType} onChange={(customerType) => setForm({ ...form, customerType })} />
        <NameFields form={form} onChange={(changes) => setForm({ ...form, ...changes })} />

        <div className="form__row">
          <label className="field">
            Phone
            <input type="tel" autoComplete="off" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <label className="field">
            <span>Other phone <span className="field__optional">(optional)</span></span>
            <input type="tel" autoComplete="off" inputMode="tel" value={form.phoneAlt} onChange={(event) => setForm({ ...form, phoneAlt: event.target.value })} />
          </label>
        </div>
        <DuplicateWarning phone={form.phone} except={customer.id} />

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
          Prefers to be reached by
          <select
            value={form.preferredContact}
            onChange={(event) => setForm({ ...form, preferredContact: event.target.value as CustomerForm['preferredContact'] })}
          >
            <option value="">Not said</option>
            {PREFERRED_CONTACTS.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
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
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <Link to={`/customers/${customer.id}`} className="text-link">
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}

// ---------------------------------------------------------------------------
// Add a property
// ---------------------------------------------------------------------------

export function NewPropertyPage() {
  const { customerId } = useParams()
  const customer = useCustomer(customerId)

  if (customer.isError) {
    return (
      <>
        <BackLink to={`/customers/${customerId}`}>Customer</BackLink>
        <PageHeader title="New property" locationFilter={false} />
        <LoadProblem what="this customer" retry={() => void customer.refetch()} />
      </>
    )
  }
  if (customer.isPending) {
    return (
      <>
        <BackLink to={`/customers/${customerId}`}>Customer</BackLink>
        <PageHeader title="New property" locationFilter={false} />
        <LoadingText>Loading…</LoadingText>
      </>
    )
  }
  if (!customer.data) return <CustomerNotFound />
  return <NewPropertyForm customer={customer.data} />
}

function NewPropertyForm({ customer }: { customer: Customer }) {
  const backend = useBackend()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<PropertyForm>({ ...emptyPropertyForm })
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (property: NewProperty) => backend.addProperty(customer.id, property),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['properties'] })
      navigate(`/customers/${customer.id}`)
    },
    onError: (caught) => setError(friendlyMessage(caught, 'Could not save the property. Check the connection and try again.')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = newPropertyFrom(form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    save.mutate(result.property)
  }

  return (
    <>
      <BackLink to={`/customers/${customer.id}`}>{customerName(customer)}</BackLink>
      <PageHeader eyebrow="New property" title={customerName(customer)} locationFilter={false} />
      <form className="panel form form--panel" onSubmit={onSubmit} noValidate>
        <PropertyFields legend="Property address" form={form} onChange={setForm} />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form__actions">
          <button type="submit" className="button-next" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save property'}
          </button>
          <Link to={`/customers/${customer.id}`} className="text-link">
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}
