import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions'],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  viteFinal: (config) => {
    config.plugins = config.plugins || [];
    return config;
  },
};
export default config;
