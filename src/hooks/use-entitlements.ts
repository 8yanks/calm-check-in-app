// React hook for subscribing to the current user's entitlement.
//
// One single fetch on mount + on auth state changes. Refresh exposed for
// manual reload after a checkout completes (until V2.3.4 wires Stripe).

import { useCallback, useEffect, useState } from "react";
import { fetchMyEntitlement, type Entitlement, getEntitlementFromRow } from "@/lib/entitlements";
import { supabase } from "@/integrations/supabase/client";

export function useEntitlements() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const ent = await fetchMyEntitlement();
    setEntitlement(ent);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMyEntitlement().then((ent) => {
      if (!cancelled) {
        setEntitlement(ent);
        setLoading(false);
      }
    });

    // Re-fetch on auth changes (login/logout invalidates entitlement cache)
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) {
        setEntitlement(getEntitlementFromRow(null));
        return;
      }
      // Re-fetch on sign-in / token refresh
      fetchMyEntitlement().then((ent) => {
        if (!cancelled) setEntitlement(ent);
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { entitlement, loading, refresh };
}
