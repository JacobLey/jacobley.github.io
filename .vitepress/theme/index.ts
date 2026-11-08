import type { EnhanceAppContext } from 'vitepress';
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import Theme from 'vitepress/theme';
import BlogPosts from './components/BlogPosts.vue';
import PostHeader from './components/PostHeader.vue';
// eslint-disable-next-line import-x/order -- Last, so twoslash's styles override the theme's
import '@shikijs/vitepress-twoslash/style.css';

export default {
    extends: Theme,
    enhanceApp({ app }: EnhanceAppContext): void {
        app.use(TwoslashFloatingVue);
        app.component('BlogPosts', BlogPosts);
        app.component('PostHeader', PostHeader);
    },
};
