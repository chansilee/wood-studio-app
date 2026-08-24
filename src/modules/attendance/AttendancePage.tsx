export function AttendancePage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">打卡系統</h1>
      <p className="text-gray-600">
        TODO：地理圍欄打卡（上/下班，下班取最後一次）、午休/晚餐時段設定、每日打卡 history 與出勤狀態判斷。
        資料表 <code>attendance_events</code>、view <code>attendance_daily</code>、
        <code>org_settings</code>（午休/晚餐/圍欄半徑）已建立，可獨立開 task 實作 UI + geofence 驗證邏輯。
      </p>
    </div>
  )
}
