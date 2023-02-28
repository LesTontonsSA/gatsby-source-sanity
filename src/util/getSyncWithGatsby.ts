import {Node, SourceNodesArgs} from 'gatsby'
import debug from '../debug'
import {SanityInputNode} from '../types/gatsby'
import {SanityDocument} from '../types/sanity'
import createNodeManifest from './createNodeManifest'
import {prefixId, unprefixId} from './documentIds'
import {getTypeName, ProcessingOptions, toGatsbyNode} from './normalize'
import {TypeMap} from './remoteGraphQLSchema'


const renameMainSite = (name: string): string => {
  const siteSlug = process.env.GATSBY_SANITY_SITE_SLUG;
  if (siteSlug) {
      const newType = name?.replace(`${siteSlug}_`, "");
      return newType;
  }
  return name;
}

function renameType(obj: any) {
  if (obj._type) {
    obj._type = renameMainSite(obj._type);
  }
  Object.keys(obj).forEach(key => {
    const newKey = renameMainSite(key);
    if (newKey !== key) {
      obj[newKey] = obj[key];
      delete obj[key];
    }
    if (typeof obj[newKey] === 'object') {
      renameType(obj[newKey]);
    }
  });
}

export type SyncWithGatsby = (id: string, document?: SanityDocument) => void

/**
 * @returns function to sync a single document from the local cache of known documents with Gatsby
 */
export default function getSyncWithGatsby(props: {
  documents: Map<string, SanityDocument>
  gatsbyNodes: Map<string, SanityInputNode | Node>
  typeMap: TypeMap
  processingOptions: ProcessingOptions
  args: SourceNodesArgs
}): SyncWithGatsby {
  const {documents, gatsbyNodes, processingOptions, args} = props
  const {typeMap, overlayDrafts} = processingOptions
  const {reporter, actions} = args
  const {createNode, deleteNode} = actions
  const siteSlug = process.env.GATSBY_SANITY_SITE_SLUG;

  documents.forEach((doc, id) => {
    console.log(`🟢A ${id} -> ${doc._type}`, doc);
    renameType(doc);
    documents.set(id, doc);
    console.log(`🟠B ${id} -> ${doc._type}`, doc);
  })

  return (id, updatedDocument) => {
    const publishedId = unprefixId(id)
    const draftId = prefixId(id)

    // `handleDeltaChanges` uses updatedDocument to avoid having to be responsible for updating `documents`
    if (updatedDocument) {
      documents.set(id, updatedDocument)
    }

    let published = documents.get(publishedId)
    let draft = documents.get(draftId)

    if (draft) {
      if (draft._type.indexOf(`${siteSlug}_`) !== -1) {
        console.log(`🔵 DRAFT -> ${draft._type}`);
      }
      draft._type = renameMainSite(draft._type);
      // draft = renameSanityFields(draft);
      documents.set(draftId, draft);
    }

    if (published) {
      if (published._type.indexOf(`${siteSlug}_`) !== -1) {
        console.log(`🔵 PUBLISHED -> ${published._type}`);
      }
      published._type = renameMainSite(published._type);
      // published = renameSanityFields(published);
      documents.set(publishedId, published);
    }

    const doc = draft || published
    if (doc) {
      const type = getTypeName(doc._type)
      if (!typeMap.objects[type]) {
        reporter.warn(
          `[sanity] Document "${doc._id}" has type ${doc._type} (${type}), which is not declared in the GraphQL schema. Make sure you run "graphql deploy". Skipping document.`,
        )
        return
      }
    }

    if (id === draftId && !overlayDrafts) {
      // do nothing, we're not overlaying drafts
      debug('overlayDrafts is not enabled, so skipping createNode for draft')
      return
    }

    if (id === publishedId) {
      if (draft && overlayDrafts) {
        // we have a draft, and overlayDrafts is enabled, so skip to the draft document instead
        debug(
          'skipping createNode of %s since there is a draft and overlayDrafts is enabled',
          publishedId,
        )
        return
      }

      if (gatsbyNodes.has(publishedId)) {
        // sync existing gatsby node with document from updated cache
        if (published) {
          debug('updating gatsby node for %s', publishedId)
          const node = toGatsbyNode(published, processingOptions)
          gatsbyNodes.set(publishedId, node)
          createNode(node)
          createNodeManifest(actions, args, node, publishedId)
        } else {
          // the published document has been removed (note - we either have no draft or overlayDrafts is not enabled so merely removing is ok here)
          debug(
            'deleting gatsby node for %s since there is no draft and overlayDrafts is not enabled',
            publishedId,
          )
          deleteNode(gatsbyNodes.get(publishedId)!)
          gatsbyNodes.delete(publishedId)
        }
      } else if (published) {
        // when we don't have a gatsby node for the published document
        debug('creating gatsby node for %s', publishedId)
        const node = toGatsbyNode(published, processingOptions)
        gatsbyNodes.set(publishedId, node)
        createNode(node)
        createNodeManifest(actions, args, node, publishedId)
      }
    }
    if (id === draftId && overlayDrafts) {
      // we're syncing a draft version and overlayDrafts is enabled
      if (gatsbyNodes.has(publishedId) && !draft && !published) {
        // have stale gatsby node for a published document that has neither a draft or a published (e.g. it's been deleted)
        debug(
          'deleting gatsby node for %s since there is neither a draft nor a published version of it any more',
          publishedId,
        )
        deleteNode(gatsbyNodes.get(publishedId)!)
        gatsbyNodes.delete(publishedId)
        return
      }

      debug(
        'Replacing gatsby node for %s using the %s document',
        publishedId,
        draft ? 'draft' : 'published',
      )
      // pick the draft if we can, otherwise pick the published
      const node = toGatsbyNode((draft || published)!, processingOptions)
      gatsbyNodes.set(publishedId, node)
      createNode(node)
      createNodeManifest(actions, args, node, publishedId)
    }
  }
}
