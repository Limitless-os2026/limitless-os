import { describeVersion } from '../lib/version'

// Small print saying which build this copy is, so an old copy can be told
// apart from the latest one at a glance.
export function AppVersion({ className }: { className: string }) {
  return <p className={className}>{describeVersion()}</p>
}
