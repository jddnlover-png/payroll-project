import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Clock, Calculator, FileText, Users, Shield, BarChart3,
  Check, ArrowRight, Star, Zap, ChevronRight,
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const features = [
  { icon: Clock, title: '스마트 근태관리', desc: '출퇴근 자동 기록, 야간·연장 자동 판별, 엑셀 일괄 업로드까지.' },
  { icon: Calculator, title: '급여 자동 정산', desc: '4대보험, 소득세, 야간수당까지 한 번에 자동 계산합니다.' },
  { icon: FileText, title: '급여명세서 발송', desc: 'PDF 생성부터 이메일·문자 발송까지 원클릭으로.' },
  { icon: Users, title: '일용직 관리', desc: '일급제, 시급제 직원의 일별 정산을 간편하게.' },
  { icon: Shield, title: '데이터 보안', desc: '업체별 완전 분리된 데이터, RLS 기반 접근 제어.' },
  { icon: BarChart3, title: 'AI 어시스턴트', desc: 'AI에게 급여·근태 관련 질문을 하면 즉시 답변.' },
];

const plans = [
  {
    name: '스타터',
    price: '₩10,000',
    period: '/월',
    desc: '10인 이하 소규모 사업장을 위한',
    features: ['직원 10명까지', '근태관리', '급여 자동계산', '급여명세서 발송', '이메일 지원'],
    cta: '시작하기',
    highlighted: false,
  },
  {
    name: '베이직',
    price: '₩20,000',
    period: '/월',
    desc: '10~30인 규모, 가장 많이 선택',
    features: ['직원 30명까지', '스타터의 모든 기본 기능 포함', 'AI 어시스턴트', '우선 지원'],
    cta: '베이직 시작하기',
    highlighted: true,
  },
  {
    name: '프로',
    price: '₩30,000',
    period: '/월',
    desc: '30~60인 규모 기업을 위한',
    features: ['직원 60명까지', '스타터의 모든 기본 기능 포함', '베이직의 모든 기능 포함', '건설업 일용직 관리 (₩30,000부터)', '전담 매니저', '60인 이상 별도 상담'],
    cta: '프로 시작하기',
    highlighted: false,
  },
];

const faqs = [
  
  { q: '데이터는 안전하게 보호되나요?', a: '네, 업체별로 완전히 분리된 데이터 저장소를 사용하며, 행 수준 보안(RLS) 정책으로 데이터를 보호합니다.' },
  { q: '일용직 직원도 관리할 수 있나요?', a: '네, 일급제·시급제 직원의 일별 근태 기록과 급여 정산을 지원합니다.' },
  { q: '기존 엑셀 데이터를 가져올 수 있나요?', a: '네, 직원 정보와 근태 기록을 엑셀 파일로 일괄 업로드할 수 있습니다.' },
  { q: '도입 시 초기 설정을 도와주나요?', a: '네, 회원가입 후 전문 담당자가 전화로 초기 설정을 도와드립니다.' },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-16 relative flex items-center justify-between">
          <div className="flex items-center gap-2.5 z-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30">
              <Zap className="h-4.5 w-4.5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              급여뚝딱
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1 text-sm font-medium absolute left-1/2 -translate-x-1/2 bg-muted/60 border border-border/50 rounded-full px-2 py-1.5 backdrop-blur-sm">
            <a href="#features" className="px-4 py-1.5 rounded-full text-foreground/80 hover:text-primary hover:bg-background transition-all">기능</a>
            <a href="#pricing" className="px-4 py-1.5 rounded-full text-foreground/80 hover:text-primary hover:bg-background transition-all">요금제</a>
            <a href="#faq" className="px-4 py-1.5 rounded-full text-foreground/80 hover:text-primary hover:bg-background transition-all">FAQ</a>
          </div>
          <div className="flex items-center gap-3 z-10">
            <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
              로그인
            </Button>
            <Button size="sm" onClick={() => navigate('/auth?tab=signup')} className="group">
              무료로 시작하기
              <ArrowRight className="ml-1 h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/3 pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-primary/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Star className="h-3.5 w-3.5" />
              50개 업체가 이미 선택한 시스템
            </div>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            3분 만에 끝나는
            <br />
            <span className="text-primary">급여관리</span>
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            근태 → 급여 계산 → 급여명세서 발송까지 한번에.
            <br className="hidden sm:block" />
            중소기업 사장님을 위한 올인원 인사관리 솔루션.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Button
              size="lg"
              className="text-base px-8 h-12 group shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
              onClick={() => navigate('/auth?tab=signup')}
            >
              무료로 시작하기
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>

          {/* Mockup */}
          <motion.div
            className="mt-16 max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <div className="rounded-2xl border bg-card shadow-2xl shadow-primary/5 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-status-yellow-text/60" />
                <div className="w-3 h-3 rounded-full bg-status-green-text/60" />
                <span className="ml-2 text-xs text-muted-foreground">급여뚝딱 — 대시보드</span>
              </div>
              <div className="p-6 sm:p-10 bg-gradient-to-b from-card to-muted/30">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: '총 직원', value: '24명', color: 'text-primary' },
                    { label: '이번 달 급여 총액', value: '₩48,200,000', color: 'text-status-green-text' },
                    { label: '금일 출근율', value: '95.8%', color: 'text-status-blue-text' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-background border p-4">
                      <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                      <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="h-32 rounded-xl bg-background border flex items-center justify-center">
                  <div className="flex items-end gap-2 h-20">
                    {[40, 65, 50, 80, 70, 90, 75, 85, 60, 95, 70, 88].map((h, i) => (
                      <div
                        key={i}
                        className="w-5 bg-primary/70 rounded-t"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="py-12 px-6 border-y bg-muted/30">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm text-muted-foreground mb-6">50개 업체가 이미 선택한 시스템</p>
          <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap opacity-40">
            {['건설A사', '유통B사', '제조C사', '물류D사', '서비스E사'].map((name) => (
              <div key={name} className="text-lg font-bold tracking-tight">{name}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={fadeUp}
            custom={0}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              급여관리의 모든 것, <span className="text-primary">한 곳에서</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              복잡한 급여 계산부터 명세서 발송까지 자동화하세요.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-30px' }}
                variants={fadeUp}
                custom={i}
              >
                <Card className="h-full border-border/60 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                      <f.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              합리적인 <span className="text-primary">요금제</span>
            </h2>
            <p className="text-muted-foreground text-lg">사업 규모에 맞는 플랜을 선택하세요.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
                className="h-full"
              >
                <Card
                  className={`h-full relative flex flex-col ${
                    plan.highlighted
                      ? 'border-primary shadow-xl shadow-primary/10 scale-105'
                      : 'border-border/60'
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
                      인기
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <p className="text-sm text-muted-foreground">{plan.desc}</p>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground text-sm">{plan.period}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 flex-1 flex flex-col">
                    <ul className="space-y-3 mb-6">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full mt-auto"
                      variant={plan.highlighted ? 'default' : 'outline'}
                      onClick={() => navigate('/auth?tab=signup')}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              자주 묻는 <span className="text-primary">질문</span>
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={1}
          >
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border rounded-xl px-5 bg-card"
                >
                  <AccordionTrigger className="text-left font-medium hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              지금 바로 시작하세요
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              복잡한 급여 계산, 이제 급여뚝딱에게 맡기세요.
            </p>
            <Button
              size="lg"
              className="text-base px-10 h-12 group shadow-lg shadow-primary/20"
              onClick={() => navigate('/auth?tab=signup')}
            >
              무료로 시작하기
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-extrabold text-base bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              급여뚝딱
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 급여뚝딱. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
