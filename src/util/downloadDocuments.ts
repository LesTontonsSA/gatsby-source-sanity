import {SanityDocument} from '../types/sanity'
import {getAllDocuments} from './getAllDocuments'

const testObject = {
  _createdAt: '2023-02-24T16:07:51Z',
  _id: '84044853-3488-4c1a-99e1-3ae57125c13e',
  _rev: 'zvth6ZrQvHNN927z9DM4ZI',
  _type: 'secondaryPage',
  _updatedAt: '2023-02-24T16:07:52Z',
  content: [
    {
      _key: '7ebe4282cb5a',
      _type: 'sectionTwoColumns',
      title: 'Some Title'
    }
  ],
  description: 'Description 2',
  hidden: false,
  i18n_lang: 'fr_CH',
  noFollow: false,
  noIndex: false,
  slug: { _type: 'slug', current: 'page-2' },
  title: 'Page 2'
}

export default function downloadDocuments(
  url: string,
  token?: string,
  options: {includeDrafts?: boolean} = {},
): Promise<Map<string, SanityDocument>> {
  return getAllDocuments(url, token, options).then(
    (stream) =>
      new Promise((resolve, reject) => {
        const documents = new Map<string, SanityDocument>()
        stream.on('data', (doc) => {
          documents.set(testObject._id, testObject)
          // documents.set(doc._id, doc)
        })
        stream.on('end', () => {
          resolve(documents)
        })
        stream.on('error', (error) => {
          reject(error)
        })
      }),
  )
}
