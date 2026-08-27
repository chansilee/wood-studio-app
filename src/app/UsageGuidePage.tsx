import { Link } from 'react-router-dom'

const STEPS = [
  '員工請於每月25號之前(不含)，上"排班系統" -> "排班喜好"，點選下個月"偏好上班/偏好放假"，點選完成會自動呈報給主管當建議。25號之後下個月"排班喜好"會鎖住無法再更新。',
  '主管於每月25日至月底之間，參考員工"排班喜好"，於主管之"排班模式"下進行該員工的下個月出勤安排。並於月底前，公布下個月排班表給員工。',
  '員工會收到班表公布的通知，請進"排班系統" -> "瀏覽模式"，審閱後按下下方 ">>我已瀏覽並確認此排班"',
  '"打卡系統"會實際依據主管發布的"最新公告"版本班表，"正常班"出勤的狀態下，員工可以按"打卡上班"/"打卡下班"，注意打卡必須在公司附近方能打卡成功',
  '若當日有忘記打卡上班，或者打卡下班者，可以用"打卡系統"->"點我補登"，補登記打卡的時間。',
  '若當日打卡扣除午休/晚餐時間，不足"約定時數"，則會跳出"異常出勤"，此時必須對當日實況做"請假"。',
  '"請假系統"，可點選紅字的"異常出勤"對過去異常出勤狀態"補請假"，或者也可以對未來"尚未出勤"的時間"預先請假"。',
  '請假可選擇"假別"，以及請假時數是"全天"或者"部分時數"，送出申報以等待主管簽核。不論主管簽核與否，自己都能刪除該筆申報，重新請假。',
  '主管會收到員工"請假通知"，進入"請假系統"->"請假月曆"，點選該員，找出黃色[審核中]的天數進行審核',
  '所有異常出勤，請在跨月的1~2號前請假/補登完畢。請勿放置不理，系統結算時會轉成"曠職"。',
  '每月1~5號，主管會導出上個月的月結。於"月結系統"，點選成員，點選下方"產出本月月結"。',
  '月結報表會核算所有"規整上班時數"，亦包含所有有薪、半薪、無薪的請假假別，以"約定時薪"算出基本薪資(加項)。目前系統尚未導入勞健保代扣除(減項)。',
  '每月5日主管發薪給員工(計算週期:上月1號~月底)。鎖死月結報表和過去所有紀錄，日後若有疑義可備查。',
]

export function UsageGuidePage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold">本系統該怎麼用？</h1>
        <Link to="/" className="text-xs text-blue-700 underline whitespace-nowrap">
          返回首頁
        </Link>
      </div>

      <div className="mb-6 overflow-x-auto">
        <img
          src={`${import.meta.env.BASE_URL}HowToUseWoodStudioApp.webp`}
          alt="員工與主管操作流程圖"
          className="w-full min-w-[900px] rounded border"
        />
      </div>

      <p className="font-medium mb-3">本程式使用行為&gt;&gt;&gt;</p>

      <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 max-w-3xl">
        {STEPS.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  )
}
