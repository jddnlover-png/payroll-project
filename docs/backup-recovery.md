# 급여뚝딱 무료 플랜 백업·복구

Supabase Free 플랜에는 예약 백업, PITR, 새 프로젝트 복원이 포함되지 않는다. 이 저장소는 GitHub Actions에서 매일 한국시간 오전 3시에 논리 백업을 생성하고 즉시 AES-256-CBC(PBKDF2)로 암호화해 7일 동안 보관한다.

## 최초 설정

GitHub 저장소의 Settings > Secrets and variables > Actions에 다음 Repository secret을 추가한다.

- `SUPABASE_DB_URL`: Supabase의 직접 또는 세션 풀러 PostgreSQL 연결 문자열. 비밀번호를 포함하므로 코드·채팅·로그에 넣지 않는다.
- `BACKUP_ENCRYPTION_PASSPHRASE`: 24자 이상의 별도 백업 암호. DB 비밀번호와 다르게 만들고 안전한 비밀번호 관리 도구에 보관한다.

설정 후 Actions > Encrypted database backup > Run workflow를 한 번 실행한다. 워크플로는 매 실행마다 별도의 일회성 빈 PostgreSQL 컨테이너를 만들고 암호화 백업의 급여뚝딱 `public` 스키마를 복호화·복원한 뒤 `organizations`, `employees`, `attendance_records`, `payroll_records` 핵심 테이블을 확인한다. Supabase 전용 내부 확장은 제품 데이터 복원 범위에서 제외한다. 검증이 끝나면 복호화된 평문과 컨테이너를 자동 폐기한다. 성공한 실행의 Artifacts에는 `.dump.enc`, `.sha256`, `metadata.json`만 존재해야 한다.

## 복구 리허설

GitHub Actions의 일일 백업은 운영 DB에 덮어쓰지 않고 매번 일회성 빈 PostgreSQL 컨테이너에서 자동 복원 리허설을 수행한다. 아래 절차는 장애 대응 또는 별도 환경에서 수동으로 다시 검증할 때 사용한다.

1. 운영 DB에 덮어쓰지 않는다. 별도의 빈 PostgreSQL/Supabase 프로젝트를 준비한다.
2. 백업 artifact를 내려받아 SHA-256을 확인한다.
3. `openssl enc -d -aes-256-cbc -pbkdf2 -in payroll-*.dump.enc -out payroll-restore.dump -pass env:BACKUP_ENCRYPTION_PASSPHRASE`로 복호화한다.
4. `pg_restore --list payroll-restore.dump`로 목록을 확인한다.
5. 빈 검증 DB에 `pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$RESTORE_DATABASE_URL" payroll-restore.dump`를 실행한다.
6. 로그인, 조직 격리, 근태 입력, 첫 급여 계산을 검증한다. 검증 DB에서는 SMS·이메일·마케팅 이벤트용 비밀값을 넣지 않는다.
7. 결과를 기록한 뒤 평문 dump와 검증 프로젝트를 삭제한다.

## 범위와 한계

- 논리 백업은 PostgreSQL 데이터베이스를 대상으로 한다.
- Storage 파일 원본, Edge Function 배포본·비밀값, 외부 SMS/이메일 설정은 Git 소스와 별도 운영 기록으로 복구한다.
- GitHub Actions가 연속 실패하면 백업 준비 완료로 판단하지 않는다.
- 실제 고객이 생기면 유료 예약 백업 또는 별도 장기 보관소를 다시 검토한다.
