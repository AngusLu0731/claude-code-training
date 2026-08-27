// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { SITE_TITLE } from './src/data/version.ts';

export default defineConfig({
	site: 'https://training.angus-lu.cc',
	integrations: [
		starlight({
			title: SITE_TITLE,
			defaultLocale: 'root',
			locales: { root: { label: '繁體中文', lang: 'zh-TW' } },
			components: { Footer: './src/components/Footer.astro' },
			sidebar: [
				{ label: '首頁與開始前', link: '/' },
				{ label: '第 1 章 多 session 多工', slug: '01-multi-session' },
				{ label: '第 2 章 workflow 定義', slug: '02-workflow' },
				{ label: '第 3 章 subagent', slug: '03-subagent' },
				{ label: '第 4 章 hooks', slug: '04-hooks' },
				{ label: '第 5 章 skills', slug: '05-skills' },
			],
		}),
	],
});
