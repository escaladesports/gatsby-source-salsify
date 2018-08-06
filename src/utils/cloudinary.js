'use strict'
module.exports = (url, ...args) => {
	url = url.split('/')
	let name = url.pop()
	url.push(args.join(','))
	return `${url.join('/')}/${name}`
}