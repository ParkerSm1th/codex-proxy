import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { BRAND_NAME, BRAND_OG_IMAGE, BRAND_TAGLINE } from "@/lib/brand";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${BRAND_NAME} Dashboard` },
      { name: "description", content: BRAND_TAGLINE },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: BRAND_NAME },
      { property: "og:title", content: BRAND_NAME },
      { property: "og:description", content: BRAND_TAGLINE },
      { property: "og:image", content: BRAND_OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: BRAND_NAME },
      { name: "twitter:description", content: BRAND_TAGLINE },
      { name: "twitter:image", content: BRAND_OG_IMAGE }
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }
    ]
  }),
  component: RootComponent
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="dark">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
