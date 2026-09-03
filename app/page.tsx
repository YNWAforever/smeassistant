import { SmePrototype } from "@/components/sme-prototype"

// The prototype shell reads search params on the client; render this route on demand like the catch-all.
export const dynamic = "force-dynamic";

export default function Home() {
  return <SmePrototype path={["zh-HK"]} />
}
