const fetch = require('isomorphic-fetch')
const crypto = require('crypto')
const glob = require('globby')
const camelCase = require('camelcase')
const matter = require('front-matter')
const fs = require('fs-extra')
const { createRemoteFileNode } = require(`gatsby-source-filesystem`)
const url = 'https://app.salsify.com/api/v1/products/'
const regStart = /[_a-zA-Z]/
const cloud = require(`./utils/cloudinary`)
const axios = require('axios')

exports.sourceNodes = async (
  { boundActionCreators, cache, store, createNodeId },
  options,
) => {
  options = Object.assign(
    {
      ids: [],
      markdownPath: false,
      apiKey: process.env.SALSIFY_API_KEY,
      types: [],
      media: [],
    },
    options,
  )

  if (!options.apiKey) {
    console.log('No API key provided')
    return
  }

  const { createNode, touchNode } = boundActionCreators

  if (options.markdownPath) {
    let idsArrays = await getIdsFromMarkdown(options.path)
    idsArrays.forEach(idArray => {
      idArray.forEach(id => {
        if (options.ids.indexOf(id) !== -1) return
        options.ids.push(id)
      })
    })
  }

  const data = await Promise.all(
    options.ids.map((id, idIndex) => {
      return fetch(`${url}${id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
        },
      })
        .then(res => {
          if (res.status !== 200) {
            return {}
          }
          return res.json()
        })
        .then(async res => {
          res = formatSalsifyObject(res)
          for (let i in options.types) {
            if (res[i]) {
              if (options.types[i] == 'array' && typeof res[i] === 'string') {
                res[i] = [res[i]]
              }
            }
          }
          options.media.forEach(key => {
            if (res[key]) {
              if (typeof res[key] === 'string') {
                res[key] = findDigitalAsset(res[key], res)
              } else {
                res[key] = res[key].map(id => {
                  return findDigitalAsset(id, res)
                })
              }
            }
          })
          let node = Object.assign(
            {
              id: id,
              parent: null,
              children: [],
              internal: {
                type: 'SalsifyContent',
                contentDigest: crypto
                  .createHash('md5')
                  .update(JSON.stringify(res))
                  .digest('hex'),
              },
            },
            res,
          )
          // store images in cache to be used for graphql
          let updated = {}
          if (options.cacheWebImages) {
            if (res[`webImages`]) {
              const updatedImages = await Promise.all(
                res[`webImages`].map(async img => {
                  let fileNodeID
                  // const webImageCacheKey = img.id
                  // const cacheMediaData = await cache.get(webImageCacheKey)
                  // if (cacheMediaData) {
                  //   fileNodeID = cacheMediaData.fileNodeID
                  //   touchNode({ nodeId: cacheMediaData.fileNodeID })
                  // }
                  // if (!fileNodeID) {
                  try {
                    const fileNode = await createRemoteFileNode({
                      url: cloud(img.url, options.cloudinaryProps),
                      store,
                      cache,
                      createNode,
                      createNodeId,
                    })
                    if (fileNode) {
                      fileNodeID = fileNode.id
                      await cache.set(webImageCacheKey, {
                        fileNodeID,
                      })
                    }
                  } catch (e) {
                    // Ignore
                  }
                  // }
                  if (fileNodeID) {
                    return fileNodeID
                  }
                }),
              )
              if (updatedImages.length > 0) {
                updated.localWebImages___NODE = updatedImages
              }
            }
          }

          if (Object.keys(updated).length > 0) {
            return { ...node, ...updated }
          } else {
            return node
          }
        })
    }),
  )

  data.forEach(datum => createNode(datum))

  return
}

function findDigitalAsset(id, res) {
  const arr = res['salsify:digitalAssets'] || []
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]['salsify:id'] === id) {
      let obj = arr[i]
      let newObj = {}
      for (let i in obj) {
        newObj[i.replace('salsify:', '')] = obj[i]
      }
      // Force HTTPS
      if (newObj.url && newObj.url.indexOf('http:') === 0) {
        newObj.url = newObj.url.replace('http:', 'https:')
      }
      return newObj
    }
  }
}

function formatSalsifyObject(obj) {
  const newObj = {}
  for (let i in obj) {
    let camelKey = camelCase(i)
    if (camelKey.charAt(0).match(regStart)) {
      newObj[camelKey] = obj[i]
    } else {
      newObj[`_${camelKey}`] = obj[i]
    }
  }
  return newObj
}

function getIdsFromMarkdown(path) {
  path = `${path}/**/*.md`
  return glob(path)
    .then(paths => {
      return Promise.all(
        paths.map(path => {
          return fs.readFile(path).then(data => {
            let updated = []
            data = data.toString()
            data = matter(data)
            if (data.attributes.variants) {
              data.attributes.variants.forEach(variant => {
                updated.push(variant.id.toUpperCase())
              })
            }
            if (data.attributes.id) {
              updated.push(data.attributes.id.toUpperCase())
            }
            return updated
          })
        }),
      )
    })
    .catch(console.error)
}
