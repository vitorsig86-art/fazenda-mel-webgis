import { useEffect, useState } from "react";
import { IonResource } from "cesium";
import { hasIonToken } from "../cesium/createViewer";

type IonConnectionStatus = "unconfigured" | "configured" | "connected" | "failed";

// Temporary diagnostic: share one request across React StrictMode effect replays.
let connectionTest: Promise<IonConnectionStatus> | undefined;

function testIonConnection(): Promise<IonConnectionStatus> {
  if (connectionTest) return connectionTest;
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim() ?? "";
  if (!token) return Promise.resolve("unconfigured");

  connectionTest = (async () => {
    try {
      // Asset 1 is Cesium World Terrain. Resolve its authenticated endpoint only:
      // one ion request, no terrain tiles and no assignment to the viewer.
      await IonResource.fromAssetId(1, { accessToken: token });
      return "connected";
    } catch (cause: unknown) {
      const error = cause as { name?: unknown; message?: unknown; statusCode?: unknown; response?: unknown } | null;
      const redact = (value: unknown) => typeof value === "string"
        ? value.split(token).join("[REDACTED]")
          .split(encodeURIComponent(token)).join("[REDACTED]")
          .replace(/((?:access_token|accessToken|token)["']?\s*[:=]\s*["']?)[^\s&"'<>]+/gi, "$1[REDACTED]")
          .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
          .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
        : undefined;
      // Never log the original error/resource: they can contain credential URLs.
      console.error("Cesium ion connection test failed", {
        assetId: 1,
        asset: "Cesium World Terrain",
        name: redact(error?.name),
        message: redact(error?.message) ?? "Ion endpoint request failed (check network/CORS).",
        statusCode: typeof error?.statusCode === "number" ? error.statusCode : undefined,
        response: redact(error?.response),
      });
      return "failed";
    }
  })();
  return connectionTest;
}

export function useIonConnectionTest() {
  const [status, setStatus] = useState<IonConnectionStatus>(hasIonToken ? "configured" : "unconfigured");

  useEffect(() => {
    let active = true;
    void testIonConnection().then((result) => {
      if (active) setStatus(result);
    });
    return () => { active = false; };
  }, []);

  return status;
}
