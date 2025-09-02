import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4.0 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "🌌CHAOSMOTIC ☆⋆｡𖦹°‧★ SYSTEMS🪐",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "plausible",
    },
    locale: "en-US",
    baseUrl: "diagrammatic.media/chaosmotic-systems-wiki",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "created",
    generateSocialImages: false,
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Noto Sans",
        body: "Ysra",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f9f9ff",
          lightgray: "#ebeafb",
          gray: "#bbbace",
          darkgray: "#4e4d6d",
          dark: "#252543",
          secondary: "#5c63d9",
          tertiary: "#f7a9ff",
          highlight: "rgba(92,99,217,0.15)",
          textHighlight: "#fff9c688",
        },
        darkMode: {
          light: "#1c1c31",
          lightgray: "#31314a",
          gray: "#707082",
          darkgray: "#d7d7e7",
          dark: "#f5f5fa",
          secondary: "#9cb0ff",
          tertiary: "#cc86d9",
          highlight: "rgba(247,169,255,0.15)",
          textHighlight: "#ffe0ff",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
