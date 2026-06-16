import { describe, it, expect } from 'vitest'
import { extractRevisedHtml } from '@/components/material-chat'

describe('extractRevisedHtml', () => {
  it('returns null when no html block present', () => {
    expect(extractRevisedHtml('Saya sarankan menambah contoh.')).toBeNull()
  })

  it('extracts the html block content', () => {
    const text = 'Sudah saya perbarui:\n```html\n<h2>Sel</h2><p>Isi</p>\n```'
    expect(extractRevisedHtml(text)).toBe('<h2>Sel</h2><p>Isi</p>')
  })

  it('returns the last block when multiple present', () => {
    const text = '```html\n<p>A</p>\n```\nlalu\n```html\n<p>B</p>\n```'
    expect(extractRevisedHtml(text)).toBe('<p>B</p>')
  })
})
