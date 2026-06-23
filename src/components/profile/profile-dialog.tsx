import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { User, Sparkles } from "lucide-react";

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const currentName =
    user?.user_metadata?.nome ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    "";
  const [nome, setNome] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nome.trim();
    if (!trimmed || trimmed.length < 2) {
      toast.error("O nome deve ter pelo menos 2 caracteres.");
      return;
    }
    if (trimmed.length > 80) {
      toast.error("O nome deve ter no máximo 80 caracteres.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { nome: trimmed },
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Nome atualizado com sucesso!");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_4px_24px_rgba(217,70,239,0.15)]">
              <User className="size-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                Meu Perfil
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Personalize seu nome de exibição
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="display-name" className="text-sm font-medium">
              Nome de Exibição
            </Label>
            <Input
              id="display-name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              required
              className="h-11 rounded-xl"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Este nome será usado para personalizar a saudação no sistema.
            </p>
          </div>

          {user?.email && (
            <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Email
              </span>
              <p className="text-sm text-foreground">{user.email}</p>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl bg-[#D946EF]/5 border border-[#D946EF]/10 p-3">
            <Sparkles className="size-4 text-[#D946EF] shrink-0" />
            <p className="text-xs text-muted-foreground">
              A mensagem de boas-vindas no Menu Geral será atualizada
              automaticamente.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || nome.trim() === currentName}
              className="rounded-xl bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_24px_rgba(217,70,239,0.15)] hover:shadow-[0_8px_32px_rgba(217,70,239,0.25)] transition-all"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
