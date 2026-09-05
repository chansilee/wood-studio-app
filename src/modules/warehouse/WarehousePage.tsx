import { useState } from 'react'
import { InventoryDiagramListPage } from './InventoryDiagramListPage'

type Tab = 'stock' | 'diagrams'

export function WarehousePage() {
  const [tab, setTab] = useState<Tab>('stock')

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">出入倉庫</h1>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('stock')}
            className={`px-3 py-1.5 rounded text-sm ${
              tab === 'stock' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            入庫 / 出庫
          </button>
          <button
            onClick={() => setTab('diagrams')}
            className={`px-3 py-1.5 rounded text-sm ${
              tab === 'diagrams' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            編輯入庫分類
          </button>
        </div>
      </div>

      {tab === 'stock' ? (
        <p className="text-sm text-gray-500">入庫 / 出庫操作頁面尚未開發，之後會做在這裡。</p>
      ) : (
        <InventoryDiagramListPage />
      )}
    </div>
  )
}
