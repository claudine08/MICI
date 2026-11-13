"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Bem-vindo ao MICI",
    body: "Plataforma de gestão de implantação com governança multiempresa, gates de fase e baseline imutável. Este guia rápido apresenta o fluxo principal e onde encontrar cada módulo.",
  },
  {
    title: "Fluxo de ponta a ponta",
    body: "Oportunidade → Requisitos → Orçamento → Projeto → Baseline → Execução → Avanço → Custo → Risco → Mudança → Qualidade → Comissionamento → Aceite → Encerramento. Cada transição é gateada (G0–G8) e auditada.",
  },
  {
    title: "Estrutura do trabalho",
    body: "Cadastre requisitos versionados (DRP), monte a árvore WBS e vincule atividades ao cronograma. Custos, riscos e mudanças referenciam WBS e atividades para rastreio bidirecional.",
  },
  {
    title: "Custos e suprimentos",
    body: "Use a calculadora de orçamento (/orcamento) para gerar itens de custo, acompanhe compromissos e realizados, e siga o fluxo PR → cotação → PO → recebimento, que cria compromissos e custos reais automaticamente.",
  },
  {
    title: "Qualidade, campo e documentos",
    body: "Registre diário de obra, tarefas, restrições e medições (com suporte offline). Execute checklists e inspeções, trate não conformidades e gerencie documentos com revisão e liberação.",
  },
  {
    title: "Navegação e permissões",
    body: "O menu lateral mostra apenas os módulos do seu perfil. Alterne a organização ativa no topo da tela. Gates bloqueiam avanço de fase até os critérios serem atendidos.",
  },
];

export function OnboardingGuide({
  userId,
  userName,
  initiallyDismissed,
  forceOpen,
}: {
  userId: string;
  userName: string;
  initiallyDismissed: boolean;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(forceOpen || !initiallyDismissed);
  const [step, setStep] = useState(0);
  const [showAgain, setShowAgain] = useState(!initiallyDismissed);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("mici:open-guide", handler);
    return () => window.removeEventListener("mici:open-guide", handler);
  }, []);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const close = async () => {
    try {
      await fetch("/api/v1/me/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showAgain }),
      });
    } catch {
      /* ignore */
    }
    setOpen(false);
    setStep(0);
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} title={`Guia MICI — ${userName}`} onClose={() => void close()} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">
            Passo {step + 1} de {STEPS.length}
          </span>
        </div>
        <h3 className="text-base font-semibold text-foreground">{STEPS[step].title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{STEPS[step].body}</p>

        <div className="flex items-center gap-1">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={
                index === step
                  ? "h-1.5 w-6 rounded-full bg-primary"
                  : "h-1.5 w-1.5 rounded-full bg-border"
              }
            />
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAgain}
            onChange={(event) => setShowAgain(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          Continuar mostrando este guia nos próximos acessos
        </label>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </Button>
          {isLast ? (
            <Button size="sm" onClick={() => void close()}>
              Concluir
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}>
              Próximo
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}