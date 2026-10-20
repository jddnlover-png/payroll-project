import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const canonicalUrl = "https://payroll-project-rho.vercel.app/guides/2026-short-parental-leave-payroll";
const trackingUrl = "https://marketing-platform-ivory.vercel.app/r/c7b470d592fa";
const officialSourceUrl = "https://www.moel.go.kr/policy/policydata/view.do?bbs_seq=20260800579";

const faqs = [
  {
    question: "단기 육아휴직 시행 후 급여 담당자가 가장 먼저 확인할 것은 무엇인가요?",
    answer: "시행일과 적용 대상, 신청 절차를 고용노동부의 최신 공식 안내에서 확인한 뒤 회사의 근태·휴직·급여 처리 기준과 대조해야 합니다.",
  },
  {
    question: "급여 계산 전에 어떤 자료를 정리해야 하나요?",
    answer: "휴직 시작일과 종료일, 실제 근무일, 회사 취업규칙, 급여 산정 기간과 공제 기준을 한곳에 정리해 담당자 간 해석 차이를 줄이는 것이 좋습니다.",
  },
  {
    question: "급여 프로그램만 사용하면 법적 판단까지 자동으로 해결되나요?",
    answer: "아닙니다. 급여 도구는 입력값을 바탕으로 계산과 확인을 돕습니다. 개별 근로자의 적용 여부와 법적 판단은 최신 공식 안내와 전문가 검토를 함께 확인해야 합니다.",
  },
];

export default function ShortParentalLeaveGuide() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "2026년 단기 육아휴직 시행 후 급여 담당자 확인사항 | 급여뚝딱";

    const description = "단기 육아휴직 시행 후 중소기업 급여 담당자가 확인해야 할 적용 대상, 근태·급여 처리 절차와 실무 점검 순서를 정리했습니다.";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]') ?? document.createElement("meta");
    const previousDescription = meta.content;
    meta.name = "description";
    meta.content = description;
    if (!meta.parentNode) document.head.appendChild(meta);

    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = canonicalUrl;
    document.head.appendChild(canonical);

    const structuredData = document.createElement("script");
    structuredData.type = "application/ld+json";
    structuredData.text = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: "2026년 단기 육아휴직 시행 후 급여 담당자는 무엇을 확인해야 하나요?",
          description,
          datePublished: "2026-10-20",
          dateModified: "2026-10-20",
          mainEntityOfPage: canonicalUrl,
          author: { "@type": "Organization", name: "급여뚝딱" },
          publisher: { "@type": "Organization", name: "급여뚝딱" },
        },
        {
          "@type": "FAQPage",
          mainEntity: faqs.map(({ question, answer }) => ({
            "@type": "Question",
            name: question,
            acceptedAnswer: { "@type": "Answer", text: answer },
          })),
        },
      ],
    });
    document.head.appendChild(structuredData);

    return () => {
      document.title = previousTitle;
      meta.content = previousDescription;
      canonical.remove();
      structuredData.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/landing" className="text-xl font-extrabold text-primary">급여뚝딱</Link>
          <Button asChild size="sm"><a href={trackingUrl}>첫 급여 계산 흐름 확인</a></Button>
        </div>
      </header>

      <main>
        <article className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
          <p className="mb-4 text-sm font-semibold text-primary">급여 실무 가이드 · 2026년 10월 20일 기준</p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            2026년 단기 육아휴직 시행 후<br />급여 담당자는 무엇을 확인해야 하나요?
          </h1>
          <p className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-lg leading-8">
            <strong>핵심 답변:</strong> 적용 시점과 대상, 신청 절차를 고용노동부 공식 안내에서 먼저 확인하고,
            회사의 근태·휴직·급여 처리 절차에서 달라지는 항목을 실제 급여 계산 전에 점검해야 합니다.
          </p>

          <section className="mt-12">
            <h2 className="text-2xl font-bold">급여 담당자 확인 순서</h2>
            <ol className="mt-6 space-y-5">
              {[
                ["공식 안내 확인", "시행일, 적용 대상과 신청 절차를 최신 고용노동부 자료에서 확인합니다."],
                ["사내 기준과 대조", "취업규칙과 휴직 신청 절차, 근태 마감·급여 산정 기간이 충돌하지 않는지 살핍니다."],
                ["계산 입력값 정리", "휴직 시작일·종료일, 실제 근무일, 수당과 공제에 영향을 주는 항목을 담당자끼리 동일하게 관리합니다."],
                ["계산 결과 재확인", "명세서 발행 전에 휴직 기간과 근무 기간이 의도대로 반영됐는지 원자료와 대조합니다."],
              ].map(([title, description], index) => (
                <li key={title} className="flex gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{index + 1}</span>
                  <div><h3 className="font-bold">{title}</h3><p className="mt-1 leading-7 text-slate-600">{description}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-12 rounded-2xl bg-slate-900 p-7 text-white">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold">실무에서 놓치기 쉬운 점</h2>
                <p className="mt-3 leading-7 text-slate-300">제도 안내를 확인했더라도 개별 직원의 상황과 회사 규정에 따라 처리 결과가 달라질 수 있습니다. 급여 프로그램의 계산 결과만으로 법적 판단을 대신하지 말고, 애매한 사례는 공식 기관 또는 노무 전문가에게 확인하세요.</p>
              </div>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-bold">자주 묻는 질문</h2>
            <div className="mt-6 space-y-4">
              {faqs.map(({ question, answer }) => (
                <div key={question} className="rounded-xl border bg-white p-6">
                  <h3 className="font-bold">{question}</h3>
                  <p className="mt-3 leading-7 text-slate-600">{answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12 rounded-2xl border bg-white p-7">
            <h2 className="text-xl font-bold">공식 근거</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">이 글은 고용노동부 공식 안내를 바탕으로 급여 담당자의 확인 순서를 정리한 일반 정보입니다. 제도 내용이 변경될 수 있으므로 적용 전 최신 원문을 확인하세요.</p>
            <a href={officialSourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              고용노동부 공식 안내 확인 <ExternalLink className="h-4 w-4" />
            </a>
          </section>

          <section className="mt-12 rounded-2xl bg-primary p-8 text-center text-primary-foreground">
            <CheckCircle2 className="mx-auto h-9 w-9" />
            <h2 className="mt-4 text-2xl font-bold">우리 회사 급여 계산 흐름을 확인해 보세요</h2>
            <p className="mt-3 opacity-90">예시 데이터로 근태 확인부터 급여명세서 미리보기까지 단계별로 살펴볼 수 있습니다.</p>
            <Button asChild variant="secondary" size="lg" className="mt-6">
              <a href={trackingUrl}>첫 급여 계산 흐름 확인하기 <ArrowRight className="ml-2 h-4 w-4" /></a>
            </Button>
          </section>
        </article>
      </main>
    </div>
  );
}
