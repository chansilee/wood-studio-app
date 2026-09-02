export function AttendanceTermsContent() {
  return (
    <div className="space-y-6 text-sm text-gray-800">
      <p className="font-medium">【柴柴f.t疤疤木雕工作室 出勤打卡與工作時間確認條款】</p>

      <section>
        <h2 className="font-medium mb-2">一、GPS 定位打卡與個人資料告知</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>
            1-1 本工作室採 App 線上打卡，於按鍵瞬間存取手機 GPS
            位置，僅用於即時驗證是否於工作室範圍內，後台不追蹤亦不儲存您的 GPS
            座標。如拒絕提供定位，得改採紙本簽到。
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-2">二、彈性上下班與工時計算（照實計薪原則）</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>
            2-1 本工作室採按時給薪（時薪制）及彈性上下班機制，正常約定工作時間為 10:00~12:00 及
            13:30~17:30（午休 12:00~13:30，基本約定工時為 6 小時）。
          </li>
          <li>2-2 每日給薪時數完全依 App 打卡之實際出勤時間（扣除休息時間）精準按分鐘以約定時薪（1.0倍）照實計算給付。</li>
          <li>
            2-3 容許前後共 15 分鐘內之彈性進離場與收拾時間（每日總停留時數至多 6.25
            小時）。於 8 小時法定正常工時以內之實際出勤時間，均按平時時薪照實發給。
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-2">三、提早離場與異常出勤</h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>
            3-1 提早離場（主管同意免除勞務）：如因個人事由或公務處理完畢需提早離場，經主管同意後，免請事假，當日薪資按實際打卡分鐘數照實給付。
          </li>
          <li>
            3-2 超時出勤與「自主練習」之認定（超出 6.25 小時）
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>
                額外出勤申請（6.25 ~ 8 小時）：每日出勤（含進離場緩衝）以 6.25 小時為上限。因公務需要需於 6.25
                至 8 小時區間內繼續工作者，必須於事前提出「額外出勤申請」並經主管核准，始得計入工作時數並給付平時時薪（1.0倍）。
              </li>
              <li>
                法定加班申請（超過 8 小時）：每日工作時間超過 8 小時者，必須於事前提出「加班申請」並經主管核准，始得依法採計並發給
                1.34 倍以上之加班費。
              </li>
              <li>
                自主練習 / 私人滯留：未事先申請並獲核准者，嚴格禁止擅自延長工作時間。下班打卡停留超過 6.25
                小時且未經核准者，系統將跳出彈窗，勞工應勾選「自主練習/場地借用」或「個人私事滯留」。該超出之時間屬於個人自主支配時間，負責人不得交付公務，該時段不計入工作時數，亦不得要求發給工資或加班費。
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-2">四、出勤紀錄確認</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>
            4-1 勞工如對打卡紀錄與給薪時數有異議，應於每週五前提出修正。逾期未提出異議並經系統存檔者，視為同意該出勤紀錄與實際工作時間無誤。
          </li>
        </ul>
      </section>
    </div>
  )
}
