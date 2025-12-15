import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { api } from '../api/client'
import { useClientSettingsStore } from '../store/clientSettings'
import AdminRequired from '../components/AdminRequired'
import { useAdminStatusStore } from '../store/adminStatus'

type Doc = {
  docId: string
  title: string
  text: string
  tags?: string[]
  updatedAt?: number
}

function fmtTs(ts?: number) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export default function DocsPage() {
  const { adminApiKey } = useClientSettingsStore()
  const { status: adminStatus, load: loadAdminStatus } = useAdminStatusStore()
  const [docs, setDocs] = useState<Doc[]>([])
  const [error, setError] = useState<string>('')

  const [docId, setDocId] = useState('')
  const [title, setTitle] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    loadAdminStatus()
  }, [])

  const canUseAdmin = !!adminStatus?.enabled && (adminStatus.mode === 'insecure' || !!adminApiKey)

  const load = async () => {
    try {
      const res = await api.get('/docs')
      setDocs(res.data || [])
      setError('')
    } catch (e: any) {
      setDocs([])
      setError(e?.response?.data?.error || e?.message || 'Failed to load docs')
    }
  }

  useEffect(() => {
    if (!canUseAdmin) return
    load()
  }, [canUseAdmin])

  const rows = useMemo(() => {
    return (docs || []).map((d) => [
      d.docId,
      d.title,
      (d.tags || []).join(', '),
      fmtTs(d.updatedAt),
      <button
        className="text-blue-600"
        onClick={() => {
          setDocId(d.docId)
          setTitle(d.title)
          setTagsText((d.tags || []).join(', '))
          setText(d.text)
        }}
      >
        Edit
      </button>,
    ])
  }, [docs])

  const onSave = async () => {
    if (!canUseAdmin) return
    const id = docId.trim()
    if (!id) return setError('docId required')
    const payload = {
      title: title.trim(),
      text: text.trim(),
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }
    try {
      await api.put(`/docs/${encodeURIComponent(id)}`, payload)
      setError('')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Save failed')
    }
  }

  const onDelete = async () => {
    if (!canUseAdmin) return
    const id = docId.trim()
    if (!id) return
    try {
      await api.delete(`/docs/${encodeURIComponent(id)}`)
      setError('')
      setDocId('')
      setTitle('')
      setTagsText('')
      setText('')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      {!canUseAdmin && (
        <Card title="Docs">
          <AdminRequired feature="Docs (RAG) management" mode={adminStatus?.mode} />
        </Card>
      )}

      {canUseAdmin && (
        <>
          <Card title="Docs">
            {error ? <div className="text-sm text-red-600 mb-2">{error}</div> : null}
            <Table headers={["Doc ID", "Title", "Tags", "Updated", "Action"]} rows={rows as any} />
          </Card>

          <Card title="Edit / Create Doc">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="border p-2" placeholder="docId (unique)" value={docId} onChange={(e) => setDocId(e.target.value)} />
              <input className="border p-2" placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="border p-2 md:col-span-2" placeholder="tags (comma separated)" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
              <textarea className="border p-2 md:col-span-2 h-56" placeholder="text" value={text} onChange={(e) => setText(e.target.value)} />
            </div>

            <div className="flex gap-2 mt-3">
              <button className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60" disabled={!docId.trim() || !title.trim() || !text.trim()} onClick={onSave}>
                Save
              </button>
              <button className="border px-4 py-2 rounded text-sm disabled:opacity-60" disabled={!docId.trim()} onClick={onDelete}>
                Delete
              </button>
              <button
                className="border px-4 py-2 rounded text-sm"
                onClick={() => {
                  setDocId('')
                  setTitle('')
                  setTagsText('')
                  setText('')
                  setError('')
                }}
              >
                Clear
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
