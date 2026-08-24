export function SchedulingPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">排班系統</h1>
      <p className="text-gray-600">
        TODO：月曆排班（負責人可對自己/其他成員排班，其他人僅能看自己）、
        國定假日管理、特殊假管理（天災假/選舉假遮罩）。
        資料表 <code>schedules</code> / <code>calendar_overrides</code> 已建立，RLS 已就緒，可獨立開 task 實作 UI。
      </p>
    </div>
  )
}
