import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 워크트리 루트에도 package-lock.json이 있어서 Next가 루트를 잘못 잡는다.
  // 앱은 web/ 안에서 완결된다 — 여기로 고정한다.
  turbopack: { root: __dirname },
};

export default nextConfig;
