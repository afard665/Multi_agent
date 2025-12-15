import React from 'react'
import { Link } from 'react-router-dom'

export default function AdminRequired({ feature, mode }: { feature: string; mode?: 'key' | 'insecure' | 'disabled' }) {
  return (
    <div className="text-sm text-gray-700">
      <div className="font-semibold mb-1">Admin access required</div>
      <div className="text-gray-600">
        {mode === 'disabled' ? (
          <>
            Admin endpoints روی این سرور غیرفعال‌اند. برای فعال شدن، <code>ADMIN_API_KEY</code> تنظیم کنید یا برای dev
            <code>ALLOW_INSECURE_ADMIN=true</code> بگذارید.
          </>
        ) : (
          <>
            {feature} نیاز به <code>ADMIN_API_KEY</code> دارد. کلید را در صفحه <Link className="text-blue-600" to="/settings">Settings</Link> وارد کنید.
          </>
        )}
      </div>
    </div>
  )
}
