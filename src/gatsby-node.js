const fetch = require(`isomorphic-fetch`)
const crypto = require(`crypto`)
const glob = require(`globby`)
const camelCase = require(`camelcase`)
const matter = require(`front-matter`)
const fs = require(`fs-extra`)
const PromisePool = require(`es6-promise-pool`)

const regStart = /[_a-zA-Z]/

exports.sourceNodes = async ({ boundActionCreators }, options) => {
	options = Object.assign(
		{
			ids: [],
			markdownPath: false,
			apiKey: process.env.SALSIFY_API_KEY,
			org: process.env.SALSIFY_ORG,
			concurrency: 10,
			types: [],
			media: [],
		},
		options,
	)

	if (!options.apiKey) {
		console.log(`No API key provided`)
		return
	}

	if (!options.org) {
		console.log(`No Org provided`)
		return
	}

	const url = `https://app.salsify.com/api/v1/orgs/${options.org}/products/`
	const { createNode } = boundActionCreators

	if (options.markdownPath) {
		let idsArrays = await getIdsFromMarkdown(options.path)
		idsArrays.forEach(idArray => {
			idArray.forEach(id => {
				if (options.ids.indexOf(id) !== -1) return
				options.ids.push(id)
			})
		})
	}

	/**
   * Fetch data from salsify
   * 
   * @param {string} url Url of Salsify API
   * @param {string} id ID of the product to fetch
   * @param {Object} options gatsby-config options
   * @returns {Promise} Promise chain
   */
	const salsifyFetcher = (url, id, options) => 
		fetch(`${url}${id}`, {
			method: `GET`,
			headers: {
				Authorization: `Bearer ${options.apiKey}`,
			},
		})
			.then(res => {
				if (res && res.status == 200) {
					return res.json()
				}
				return {}
			})
			.then(res => {
				res = formatSalsifyObject(res)
				for (let i in options.types) {
					if (res[i]) {
						if (options.types[i] == `array` && typeof res[i] === `string`) {
							res[i] = [res[i]]
						}
					}
				}
				options.media.forEach(key => {
					if (res[key]) {
						if (typeof res[key] === `string`) {
							res[key] = findDigitalAsset(res[key], res)
						} else {
							res[key] = res[key].map(id => {
								return findDigitalAsset(id, res)
							})
						}
					}
				})
				return Object.assign(
					{
						id: id,
						parent: null,
						children: [],
						internal: {
							type: `SalsifyContent`,
							contentDigest: crypto
								.createHash(`md5`)
								.update(JSON.stringify(res))
								.digest(`hex`),
						},
					},
					res,
				)
			})
			.then(datum => {
				createNode(datum)
			})
			.catch(function(error) {
				throw error
			})

	const generatePromises = function * () {
		for (let i = 0; i < options.ids.length; i++) {
			yield salsifyFetcher(url, options.ids[i], options)
		}
	}

	const promiseIterator = generatePromises()
	const pool = new PromisePool(promiseIterator, options.concurrency)
	await pool.start().then(() => console.log(`Salsify Source - Done!`))
	return
}

function findDigitalAsset(id, res) {
	const arr = res[`salsify:digitalAssets`] || []
	for (let i = 0; i < arr.length; i++) {
		if (arr[i][`salsify:id`] === id) {
			let obj = arr[i]
			let newObj = {}
			for (let i in obj) {
				newObj[i.replace(`salsify:`, ``)] = obj[i]
			}
			// Force HTTPS
			if (newObj.url && newObj.url.indexOf(`http:`) === 0) {
				newObj.url = newObj.url.replace(`http:`, `https:`)
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