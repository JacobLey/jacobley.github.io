import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import type { EnhanceAppContext } from 'vitepress';
import Theme from 'vitepress/theme';
import BlogPosts from './components/BlogPosts.vue';
import PostHeader from './components/PostHeader.vue';

import '@shikijs/vitepress-twoslash/style.css';

export default {
    extends: Theme,
    enhanceApp({ app }: EnhanceAppContext) {
        app.use(TwoslashFloatingVue);
        app.component('BlogPosts', BlogPosts);
        app.component('PostHeader', PostHeader);
    },
};
