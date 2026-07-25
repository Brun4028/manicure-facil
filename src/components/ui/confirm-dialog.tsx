/**
 * ConfirmDialog — Diálogo de confirmação estilizado
 *
 * Substitui o window.confirm() nativo por um diálogo com a identidade visual do sistema.
 * Suporta variantes de perigo, aviso, info e ações customizadas.
 */

import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, Info, AlertCircle } from "lucide-react";

type ConfirmVariant = "danger" | "warning" | "info" | "success";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => void;
};

const ConfirmContext = createContext<ConfirmContextType>({
  confirm: () => {},
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

const variantConfig: Record<ConfirmVariant, {
  icon: typeof AlertTriangle;
  buttonClass: string;
  iconColor: string;
}> = {
  danger: {
    icon: AlertTriangle,
    buttonClass: "bg-red-500 hover:bg-red-600 text-white",
    iconColor: "text-red-500",
  },
  warning: {
    icon: AlertCircle,
    buttonClass: "bg-amber-500 hover:bg-amber-600 text-white",
    iconColor: "text-amber-500",
  },
  info: {
    icon: Info,
    buttonClass: "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white",
    iconColor: "text-[#D946EF]",
  },
  success: {
    icon: AlertCircle,
    buttonClass: "bg-emerald-500 hover:bg-emerald-600 text-white",
    iconColor: "text-emerald-500",
  },
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
  }, []);

  const handleConfirm = async () => {
    if (!options) return;
    setLoading(true);
    try {
      await options.onConfirm();
    } finally {
      setLoading(false);
      setOpen(false);
      setOptions(null);
    }
  };

  const handleCancel = () => {
    options?.onCancel?.();
    setOpen(false);
    setOptions(null);
  };

  const config = options ? variantConfig[options.variant ?? "danger"] : variantConfig.danger;
  const IconComponent = config.icon;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={`size-10 rounded-xl bg-current/10 border border-current/20 grid place-items-center shrink-0 ${config.iconColor}`}>
                <IconComponent className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg">{options?.title ?? "Confirmação"}</DialogTitle>
              </div>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {options?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
              className="rounded-xl"
            >
              {options?.cancelText ?? "Cancelar"}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className={`rounded-xl ${config.buttonClass}`}
            >
              {loading ? "Aguarde..." : (options?.confirmText ?? "Confirmar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Hook auxiliar que retorna uma função pronta para confirmar exclusão.
 * Uso: const confirmDelete = useConfirmDelete();
 *       confirmDelete(() => deleteItem(id), "Cliente", "Maria");
 */
export function useConfirmDelete() {
  const { confirm } = useConfirm();
  
  return useCallback(
    (onDelete: () => void | Promise<void>, entidade: string, nome?: string) => {
      confirm({
        title: `Excluir ${entidade}?`,
        description: nome
          ? `Tem certeza que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`
          : `Tem certeza que deseja excluir este(a) ${entidade}? Esta ação não pode ser desfeita.`,
        confirmText: "Sim, excluir",
        cancelText: "Cancelar",
        variant: "danger",
        onConfirm: onDelete,
      });
    },
    [confirm],
  );
}
