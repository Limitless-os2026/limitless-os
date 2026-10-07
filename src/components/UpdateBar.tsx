import { useState } from 'react'
import { applyUpdate, useUpdateReady } from '../lib/appUpdate'

// A thin bar across the top of every screen, sign-in included, once a newer
// version of the app has been published.
export function UpdateBar() {
  const ready = useUpdateReady()
  const [refreshing, setRefreshing] = useState(false)
  if (!ready) return null

  return (
    <div className="update-bar" role="status">
      <span>Update ready</span>
      <button
        type="button"
        className="update-bar__button"
        disabled={refreshing}
        onClick={() => {
          setRefreshing(true)
          void applyUpdate()
        }}
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}
