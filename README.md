# gatsby-source-salsify

A Gatsby plugin for using [Salsify](https://www.salsify.com/) as a data source.

## Install

```bash
npm install --save gatsby-source-salsify
```

or with Yarn:

```bash
yarn add gatsby-source-salsify
```

## How to use

```javascript
// In your gatsby-config.js
plugins: [
	{
		resolve: 'gatsby-source-salsify',
		options: {
			ids: ['U2508', 'U2000'],
			apiKey: "your_salsify_key",
		},
	},
]
```

Or use markdown files that contain an "id" property in front matter to determine which products to use:

```javascript
// In your gatsby-config.js
plugins: [
	{
		resolve: 'gatsby-source-salsify',
		options: {
			markdownPath: `${__dirname}/src/markdown/products`,
			apiKey: "your_salsify_key",
		},
	},
]
```

`apiKey` is optional if your key is an environment variable. If it is not supplied in the options, it will still try to look for the key in the environment variable `process.env.SALSIFY_API_KEY`.

## Configuration


### Types

Salsify's API likes to interchange arrays for strings if there's only one item in the array. To make this more reliable, you can specify arrays with the `types` option.

```javascript
options: {
	types: {
		myList: 'array'
	}
}
```

### Media

Salsify's API won't automatically pass along media objects. To specify which properties are supposed to return media objects (which include the URL), use the `media` option.

```javascript
options: {
	media: [
		'myImages',
		'videos',
	]
}
```

## How to query

**Note:** All properties will be converted to camelcase so they play nice with GraphQL.

```graphql
{
	salsifyContent(id: { eq: $id }){
		itemName
	}
}
```