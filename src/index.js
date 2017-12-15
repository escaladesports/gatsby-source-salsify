const fetch = require('isomorphic-fetch')
const crypto = require('crypto')
const glob = require('globby')
const camelCase = require('camelcase')
const matter = require('front-matter')
const fs = require('fs-extra')

const url = 'https://app.salsify.com/api/v1/products/'
const regStart = /[_a-zA-Z]/

console.log('SALSIFY')

exports.sourceNodes = async ({ boundActionCreators }, options) => {

	options = Object.assign({
		ids: [],
		markdownPath: false,
		apiKey: process.env.SALSIFY_API_KEY,
		types: [],
		media: [],
	}, options)

	if (!options.apiKey){
		console.log('No API key provided')
		return
	}

	const { createNode } = boundActionCreators

	if (options.markdownPath){
		options.ids = await getIdsFromMarkdown(options.markdownPath)
	}

	const data = await Promise.all(options.ids.map(id => {
		return fetch(`${url}${id}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${options.apiKey}`
				}
			})
			.then(res => res.json())
			.then(res => {
				res = formatSalsifyObject(res)
				for (let i in options.types){
					if(res[i]){
						if (options.types[i] == 'array' && typeof res[i] === 'string'){
							res[i] = [ res[i] ]
						}
					}
				}
				options.media.forEach(key => {
					if(res[key]){
						if(typeof res[key] === 'string'){
							res[key] = findDigitalAsset(res[key], res)
						}
						else{
							res[key] = res[key].map(id => {
								return findDigitalAsset(id, res)
							})
						}
					}
				})


				return Object.assign({
					id: id,
					parent: null,
					children: [],
					internal: {
						type: 'SalsifyContent',
						contentDigest: crypto
							.createHash('md5')
							.update(JSON.stringify(res))
							.digest('hex')
					}
				}, res)
			})
	}))

	data.forEach(datum => createNode(datum))

	return
}

function findDigitalAsset(id, res){
	const arr = res['salsify:digitalAssets'] || []
	for(let i = 0; i < arr.length; i++){
		if(arr[i]['salsify:id'] === id){
			let obj = arr[i]
			let newObj = {}
			for(let i in obj){
				newObj[i.replace('salsify:', '')] = obj[i]
			}
			// Force HTTPS
			if(newObj.url && newObj.url.indexOf('http:') === 0){
				newObj.url = newObj.url.replace('http:', 'https:')
			}
			return newObj
		}
	}
}

function formatSalsifyObject(obj) {
	const newObj = {}
	for(let i in obj){
		let camelKey = camelCase(i)
		if (camelKey.charAt(0).match(regStart)){
			newObj[camelKey] = obj[i]
		}
		else{
			newObj[`_${camelKey}`] = obj[i]
		}
	}
	return newObj
}

function getIdsFromMarkdown(path){
	path = `${path}/**/*.md`
	return glob(path)
		.then(paths => {
			return Promise.all(paths.map(path => {
				return fs.readFile(path)
					.then(data => {
						data = data.toString()
						data = matter(data)
						return data.attributes.id.toUpperCase() || ''
					})
			}))
		})
		.catch(console.error)
}