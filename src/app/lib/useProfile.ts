import { useCallback, useEffect, useState } from "react";
import { api, type Profile } from "./api";

export function useProfile(enabled: boolean) {
  const [profile, setProfile] = useState<Profile>({ weight_kg: 65, weekly_goal_km: 20 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    api.getProfile()
      .then((r) => setProfile(r.profile))
      .catch((e) => {
        // 404 (edge function not redeployed yet) or network error: keep default
        console.warn("Profile load failed, using default:", e?.message);
      })
      .finally(() => setLoaded(true));
  }, [enabled]);

  const save = useCallback(async (p: Profile) => {
    const { profile: saved } = await api.saveProfile(p);
    setProfile(saved);
    return saved;
  }, []);

  return { profile, setProfile, save, loaded };
}
