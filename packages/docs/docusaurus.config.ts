import path from 'path';
import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'VizCraft',
  tagline:
    'Fluent, Type-Safe SVG Scene Builder with native animation orchestration',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://vizcraft.vercel.app',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'ChipiKaf', // Usually your GitHub org/user name.
  projectName: 'vizcraft', // Usually your repo name.

  onBrokenLinks: 'warn',
  onBrokenAnchors: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    'docusaurus-plugin-sass',
    () => ({
      name: 'resolve-workspace-packages',
      configureWebpack() {
        return {
          resolve: {
            alias: {
              vizcraft: path.resolve(__dirname, '../core/dist/index.js'),
              'react-vizcraft': path.resolve(
                __dirname,
                '../react-vizcraft/src/index.ts'
              ),
            },
          },
        };
      },
    }),
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/ChipiKaf/vizcraft/tree/main/packages/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-live-codeblock'],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'VizCraft',
      logo: {
        alt: 'VizCraft Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/ChipiKaf/vizcraft',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/tutorials/getting-started',
            },
            {
              label: 'Tutorials',
              to: '/docs/category/tutorials',
            },
          ],
        },
        {
          title: 'Docs',
          items: [
            {
              label: 'How-To Guides',
              to: '/docs/category/how-to-guides',
            },
            {
              label: 'API Reference',
              to: '/docs/reference/builder-api',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/ChipiKaf/vizcraft',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Chipili Kafwilo. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
