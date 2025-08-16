import type { Preview } from '@storybook/html';
import '@pegboard/core/src/styles/pegboard.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: ['Getting Started', 'Grid & Layout', 'Interactions', 'Data', 'Sample'],
      },
    },
  },
};

export default preview;
