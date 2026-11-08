import type { Post } from '../blog.js';
import { createPostsLoader } from '../blog.js';

declare const data: readonly Post[];
export { data };

export default createPostsLoader();
