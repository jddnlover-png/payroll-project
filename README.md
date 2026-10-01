# payroll-project

## 마케팅 전환 이벤트 연동

급여뚝딱은 마케팅 추적 링크의 `mk_click` 값을 브라우저에 최대 30일 보관하고, 인증된 사용자의 가입 완료와 첫 급여 계산 완료를 Vercel 서버 함수에서 마케팅 플랫폼으로 전달합니다.

- 운영 Vercel 환경변수 `MARKETING_EVENT_API_KEY`에 마케팅 플랫폼 제품 API 키를 저장합니다.
- 선택 환경변수 `MARKETING_EVENT_API_URL`은 기본값 `https://marketing-platform-ivory.vercel.app/api/v1/events`를 다른 수신 주소로 바꿀 때만 사용합니다.
- API 키는 프런트엔드의 `VITE_` 환경변수나 Git 저장소에 넣지 않습니다.
- 전송 데이터는 Supabase 사용자 ID, 이벤트 종류, `mk_click`과 기능 이름뿐이며 이메일·비밀번호·급여 원문은 포함하지 않습니다.
- 마케팅 API 오류는 가입이나 급여 계산을 실패시키지 않습니다. 가입 이벤트는 다음 인증 시도에 다시 전송하고, 핵심 기능 이벤트는 다음 급여 계산 때 동일한 이벤트 ID로 재시도됩니다.
