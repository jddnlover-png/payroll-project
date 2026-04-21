
# 퇴직 직원 재직 복귀 테스트 버튼 추가

## 개요
직원 목록에서 퇴직 상태인 직원의 상태 Badge를 클릭하면 퇴사일을 초기화하고 자동으로 재직 상태로 복귀시키는 기능을 추가합니다. 반대로 재직 상태 Badge를 클릭하면 오늘 날짜로 퇴사 처리가 됩니다.

## 변경 사항

### `src/components/tabs/EmployeeTab.tsx`

1. **상태 Badge를 클릭 가능하도록 변경** (직원 목록 테이블 내)
   - 현재 정적 Badge인 재직/퇴직 상태를 클릭 가능한 버튼형 Badge로 변경
   - **퇴직 Badge 클릭 시**: `resignation_date`를 `null`로, `is_active`를 `true`로 업데이트하여 재직 복귀
   - **재직 Badge 클릭 시**: `resignation_date`를 오늘 날짜로, `is_active`를 `false`로 업데이트하여 퇴직 처리
   - 클릭 시 확인 다이얼로그 표시 (예: "재직 상태로 변경하시겠습니까?")

2. **토글 핸들러 함수 추가**
   - `handleToggleStatus(employee)` 함수를 새로 작성
   - `updateEmployee.mutate`를 호출하여 DB에 즉시 반영

## 기대 효과
- 직원 수정 다이얼로그를 열지 않고도 빠르게 상태 전환 가능
- 퇴사일 삭제 시 재직 복귀가 정상 동작하는지 쉽게 확인 가능
