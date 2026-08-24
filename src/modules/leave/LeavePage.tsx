export function LeavePage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">請假系統</h1>
      <p className="text-gray-600">
        TODO：僅能對已排定「正常班」的日期申請請假（事假/病假/婚假/喪假/公出/曠職，全天或部分時數）。
        資料表 <code>leave_requests</code> 已建立，可獨立開 task 實作 UI + 與 schedules 的日期校驗。
      </p>
    </div>
  )
}
