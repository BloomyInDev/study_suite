import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true })

export function renderMarkdown(src: string): string {
    const html = marked.parse(src) as string
    return DOMPurify.sanitize(html)
}
