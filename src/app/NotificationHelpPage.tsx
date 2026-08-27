import { Link } from 'react-router-dom'

export function NotificationHelpPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold">什麼時候通知？</h1>
        <Link to="/" className="text-xs text-blue-700 underline whitespace-nowrap">
          返回首頁
        </Link>
      </div>

      <div className="space-y-8 text-sm">
        <section>
          <h2 className="font-medium mb-2">所有人（負責人、正式員工、學徒）</h2>
          <ul className="list-disc pl-5 space-y-1 text-gray-700">
            <li>
              當負責人在[排班系統]公告你的班表（第一次公告，或後續有更新）時，通知中心會顯示「您收到[X月]排班表，請進[排班系統]-&gt;[瀏覽模式]確認班表狀態」。
            </li>
            <li>
              這則通知會持續顯示，直到你自己在[排班系統]-[瀏覽模式]按下「我已瀏覽並確認此排班」為止；確認之後就會自動消失。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-medium mb-2">只有負責人會額外收到的系統提醒</h2>

          <div className="mb-4">
            <h3 className="font-medium text-gray-800 mb-1">1. 月底提醒公告下月班表</h3>
            <p className="text-gray-700">
              每月 25 號起，若[排班設定]的「月底提醒公告下月排班狀態」有開啟，系統會檢查每一位在[成員管理]被勾選「必須公告班表」的成員，只要他們下個月的班表還沒公告，通知中心就會顯示紅字提醒。這則提醒會每天持續出現，直到你幫該成員公告下個月班表為止。
            </p>
          </div>

          <div className="mb-4">
            <h3 className="font-medium text-gray-800 mb-1">2. 待審核請假提醒</h3>
            <p className="text-gray-700">
              只要有任何請假申請處於「審核中」狀態，通知中心就會依「成員＋月份」分組顯示，例如「你有[2]筆小明 -
              [8月]待審核的請假，請至[請假系統]-該成員頁面進行審核」。這則提醒會持續出現，直到該成員當月所有待審核的請假都被你同意或不同意為止。
            </p>
          </div>

          <div className="mb-4">
            <h3 className="font-medium text-gray-800 mb-1">3. 月結提醒</h3>
            <p className="text-gray-700">
              每月 1 號到 5 號之間，系統會檢查每一位在[成員管理]被勾選「必須計算月結」的成員，看看他們上個月的月結是否已經產出。若還沒有，通知中心就會顯示紅字提醒，請你到[月結系統]幫該成員產出上個月的月結。
            </p>
            <p className="text-gray-700 mt-1">
              產出月結的方式：進入[月結系統]，選擇該成員與月份，在頁面最下方按下「產出本月月結」。這顆按鈕只有在「結算月份的下個月 1 號～5 號」之間才能按下去，其餘時間點擊會直接跳出視窗拒絕，不會產生任何資料。
            </p>
            <p className="text-gray-700 mt-1">
              一旦成功產出月結鏡像，該成員這個月的提醒就會立刻消失；已經產出的所有鏡像可以在[月結系統]右上角的「已過月結結算」查詢、查看內容或刪除（僅負責人可見）。
            </p>
          </div>

          <div className="mb-4">
            <h3 className="font-medium text-gray-800 mb-1">4. 待審核補登打卡提醒</h3>
            <p className="text-gray-700">
              只要有任何「補登上班/下班」打卡處於「審核中」狀態，通知中心就會依「成員＋月份」分組顯示，例如「你有[1]筆小明 -
              [8月]待審核的補登打卡，請至[打卡系統]-該成員頁面進行審核」。
            </p>
            <p className="text-gray-700 mt-1">
              審核方式：進入[打卡系統]，選擇該成員，展開「歷史打卡紀錄」，對該筆補登按下「同意」或「不同意」。這則提醒會持續出現，直到該成員當月所有待審核的補登都被你處理完為止。
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">5. 年初新時薪提醒</h3>
            <p className="text-gray-700">
              每年 1 月整個月，系統會檢查每一位到職日「早於或等於當年 1/1」的成員，看看他們在[成員管理]的[$]約定月薪表裡，是否已經有一筆「當年 1/1」生效的時薪紀錄。若還沒有，通知中心就會顯示紅字提醒，例如「您尚未新增小明 - 2027年的&lt;新時薪&gt;，請至&lt;成員管理&gt;該成員的[$]裡新增」。
            </p>
            <p className="text-gray-700 mt-1">
              當年才到職（到職日晚於當年 1/1）的成員不會出現這則提醒，因為他們的第一筆時薪本來就是從自己的到職日起算，不需要額外新增當年 1/1 那筆。
            </p>
            <p className="text-gray-700 mt-1">
              新增方式：進入[成員管理]，點該成員列的 [$] 展開約定月薪表，按下[編輯]，用最下面的 [+] 新增一行、把時間設定為當年 1/1、填入新的時薪，再按[儲存]。一旦補上這筆紀錄，提醒就會立刻消失。
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
