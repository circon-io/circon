import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The dashboard is a control surface, not a content site: no image
  // optimisation to pay for, and every page is behind auth.
  images: { unoptimized: true },
}

export default nextConfig

// Makes `next dev` see the same bindings the deployed Worker gets, so local
// development is not a different environment.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
void initOpenNextCloudflareForDev()
