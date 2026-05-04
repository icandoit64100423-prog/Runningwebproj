import { useState } from "react";
import { toast } from "sonner";
import type { Profile } from "../lib/api";

export function ProfileDialog({
  profile, onSave, onClose,
}: { profile: Profile; onSave: (p: Profile) => Promise<Profile>; onClose: () => void }) {
  const [weight, setWeight] = useState(profile.weight_kg);
  const [goal, setGoal] = useState(profile.weekly_goal_km);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ weight_kg: Number(weight) || 65, weekly_goal_km: Number(goal) || 20 });
      toast.success("프로필이 저장되었습니다.");
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-widest text-orange-600">Profile</div>
        <h2 className="text-2xl tracking-tight mt-1 mb-6" style={{ fontFamily: "'Instrument Serif', serif" }}>개인 설정</h2>

        <label className="block mb-4">
          <span className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">체중 (kg)</span>
          <div className="border border-neutral-200 rounded-xl px-4 py-3 flex items-baseline gap-2">
            <input type="number" step="0.1" min={20} max={200} value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent outline-none" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28 }} />
            <span className="text-sm text-neutral-400">kg</span>
          </div>
        </label>

        <label className="block mb-6">
          <span className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">주간 목표 거리</span>
          <div className="border border-neutral-200 rounded-xl px-4 py-3 flex items-baseline gap-2">
            <input type="number" step="1" min={0} max={500} value={goal}
              onChange={(e) => setGoal(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent outline-none" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28 }} />
            <span className="text-sm text-neutral-400">km / week</span>
          </div>
          <p className="text-xs text-neutral-400 mt-2">매주 목표 진행률이 홈에 표시됩니다.</p>
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-neutral-200 rounded-full py-3 text-sm hover:bg-neutral-50">취소</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full py-3 text-sm">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
