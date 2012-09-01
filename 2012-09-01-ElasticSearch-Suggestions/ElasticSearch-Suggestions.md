[ElasticSearch](http://www.elasticsearch.org/) is a zero-configuration, real-time, clustered search-oriented JSON data store built on top of Apache Lucene. In fact,
there is configuration but it is optional and available via ElasticSearch's REST API. This post is a quick demonstration of setting
up a configuration to provide search suggestions, and the query you use to extract them.

First, grab the latest ElasticSearch and fire it up. I will assume you have it running at [http://localhost:9200](http://localhost:9200).

```console
$ curl -XGET 'http://localhost:9200?pretty=1'
{
  "ok" : true,
  "status" : 200,
  "name" : "Mysterio",
  "version" : {
    "number" : "0.19.9",
    "snapshot_build" : false
  },
  "tagline" : "You Know, for Search"
}
```

For today, we are indexing a bunch of articles of clothing with a description, like so:

```json
{
 "sku": "leather-jacket",
 "title": "Leather Jacket",
 "description": "A must have in order to look like a real biker. Sleaveless varieties will effectively show off your guns."
}
```

Even though we could just post some documents into ElasticSearch, because of [Issue #2225](https://github.com/elasticsearch/elasticsearch/issues/2225)
we really want to create our whole config prior to adding any documents. But it can be instructive to check out what happens automatically to the
bits that we are going to customize.

```console
$ curl -XPOST 'http://localhost:9200/store/clothing/leather-jacket?pretty=1' -d '
{
 "sku": "leather-jacket",
 "title": "Leather Jacket",
 "description": "A must have in order to look like a real biker. Sleaveless varieties will effectively show off your guns."
}
'

{
  "ok" : true,
  "_index" : "store",
  "_type" : "clothing",
  "_id" : "leather-jacket",
  "_version" : 1
}

$ curl -XGET 'http://localhost:9200/store/clothing/leather-jacket?pretty=1'
{
  "_index" : "store",
  "_type" : "clothing",
  "_id" : "leather-jacket",
  "_version" : 1,
  "exists" : true,
  "_source" : {
    "sku": "leather-jacket",
    "title": "Leather Jacket",
    "description": "A must have in order to look like a real biker. Sleaveless varieties will effectively show off your guns."
  }
}

$ curl -XGET 'http://localhost:9200/store/_settings?pretty=1'
{
  "store" : {
    "settings" : {
      "index.number_of_shards" : "5",
      "index.number_of_replicas" : "1",
      "index.version.created" : "190999"
    }
  }
}

$ curl -XGET 'http://localhost:9200/store/_mapping?pretty=1'
{
  "store" : {
    "clothing" : {
      "properties" : {
        "description" : {
          "type" : "string"
        },
        "sku" : {
          "type" : "string"
        },
        "title" : {
          "type" : "string"
        }
      }
    }
  }
}

$ curl -XDELETE 'http://eocalhost:9200/store?pretty=1'
{
  "ok" : true,
  "acknowledged" : true
}
```

In order to generate search suggestions, we are going to want to harvest un-stemmed phrases from the description of about 2 to 5 words.
This is what is known as a `ShingleFilter` in Lucene parlance, and `shingle` when you add a token filter to ElasticSearch. ElasticSearch
breaks your documents down into _properties_ which may each contain many _fields_ that are each different ways that property is analyzed.
Each _field_ gets an _analyzer_, and each _analyzer_ is composed of a _tokenizer_ and a list of _filters_. You need to define them all
by name so that you can reference them in your fields.

(Note: If you use ElasticSearch 0.19.9 or earlier, the `min_shingle_size` and `max_shingle_size` arguments are reversed, but this is fixed by ~~[Pull #2226](https://github.com/elasticsearch/elasticsearch/pull/2226)~~)

```json
{
  "settings": {
    "analysis": {
      "analyzer": {
        "suggestions": {
          "tokenizer": "standard",
          "filter": ["suggestions_shingle"]
        }
      },
      "filter": {
        "suggestions_shingle": {
          "type": "shingle",
          "min_shingle_size": 5,
          "max_shingle_size": 2
        }
      }
    }
  }
}
```

And let us POST it and see what the result looks like

```console
$ curl -XPOST 'http://localhost:9200/store?pretty=1' -d '
{
  "settings": {
    "analysis": {
      "analyzer": {
        "suggestions": {
          "tokenizer": "standard",
          "filter": ["suggestions_shingle"]
        }
      },
      "filter": {
        "suggestions_shingle": {
          "type": "shingle",
          "min_shingle_size": 5,
          "max_shingle_size": 2
        }
      }
    }
  }
}'

$ curl -XGET 'http://localhost:9200/store/_settings?pretty=1'
{
  "store" : {
    "settings" : {
      "index.analysis.filter.suggestions_shingle.min_shingle_size" : "2",
      "index.analysis.analyzer.suggestions.filter.0" : "suggestions_shingle",
      "index.analysis.analyzer.suggestions.tokenizer" : "standard",
      "index.analysis.filter.suggestions_shingle.type" : "shingle",
      "index.analysis.filter.suggestions_shingle.max_shingle_size" : "5",
      "index.number_of_shards" : "5",
      "index.number_of_replicas" : "1",
      "index.version.created" : "190999"
    }
  }
}
```

Now we have the desired analyzer available, and we need to set it up so that when we post to the `store/clothing` document type, that the `description` field
is analyzed appropriately. This is what is called [Mapping](http://www.elasticsearch.org/guide/reference/mapping/) and here is the JSON we are going to post.

```json
{
  "clothing": {
    "properties": {
      "description": {
        "type": "multi_field",
        "fields": {
          "description": { "type": "string", "analyzer": "standard", "include_in_all": true },
          "suggestions": { "type": "string", "analyzer": "suggestions", "include_in_all": false }
        }
      } 
    }
  }
}
```

We refer to these _fields_ as `description.description` and `description.suggestions`. The first field is "magic" in that it is the default
field and the only one that can have `include_in_all` set to to `true`, which means that normal searches will use that. The suggestions
field will only be used when explicitly requested in a query.

```console
$ curl -XPUT 'http://localhost:9200/store/clothing/_mapping?pretty=1' -d '
{
  "clothing": {
    "properties": {
      "description": {
        "type": "multi_field",
        "fields": {
          "description": { "type": "string", "analyzer": "standard", "include_in_all": true },
          "suggestions": { "type": "string", "analyzer": "suggestions", "include_in_all": false }
        }
      }
    }
  }
}
'
{
  "ok" : true,
  "acknowledged" : true
}

$ curl -XGET 'http://localhost:9200/store/clothing/_mapping?pretty=1'
{
  "clothing" : {
    "properties" : {
      "description" : {
        "type" : "multi_field",
        "fields" : {
          "description" : {
            "type" : "string",
            "analyzer" : "standard",
            "include_in_all" : true
          },
          "suggestions" : {
            "type" : "string",
            "analyzer" : "suggestions",
            "include_in_all" : false
          }
        }
      }
    }
  }
}
```

Now let us populate our index a bit and check what the settings and mapping look like

```bash
curl -XPOST 'http://localhost:9200/store/clothing/leather-jacket?pretty=1' -d '{
 "sku": "leather-jacket",
 "title": "Leather Jacket",
 "description": "A must have in order to look like a real biker. Sleaveless varieties will effectively show off your guns."
}'

curl -XPOST 'http://localhost:9200/store/clothing/silk-scarf?pretty=1' -d '{
 "sku": "silk-scarf",
 "title": "Silk Scarf",
 "description": "On a chilly autumn day, the right color can make any outfit look absolutely fabulous."
}'

curl -XPOST 'http://localhost:9200/store/clothing/ten-gallon-hat?pretty=1' -d '{
 "sku": "ten-gallon-hat",
 "title": "Ten Gallon Hat",
 "description": "You will not fail to make an impression."
}'

curl -XPOST 'http://localhost:9200/store/clothing/wool-socks?pretty=1' -d '{
 "sku": "wool-socks",
 "title": "Wool Socks",
 "description": "This is absolutely the best way to keep warm. Wear them high and proud, even if they look a little funny with shorts."
}'
```

And you can see the added properties from the dynamic addition of docs:

```console
$ curl -XGET 'http://localhost:9200/store/_mapping?pretty=1'
{
  "store" : {
    "clothing" : {
      "properties" : {
        "description" : {
          "type" : "multi_field",
          "fields" : {
            "description" : {
              "type" : "string",
              "analyzer" : "standard",
              "include_in_all" : true
            },
            "suggestions" : {
              "type" : "string",
              "analyzer" : "suggestions",
              "include_in_all" : false
            }
          }
        },
        "sku" : {
          "type" : "string"
        },
        "title" : {
          "type" : "string"
        }
      }
    }
  }
}
```

Now we have suggestions in there, but how do we query them? We want to get a list of phrases for which documents
have high scores that could complete whatever characters we have typed. So we want a prefix query, but what
we want to return is the suggestions themselves, not the documents. So, a naive query for suggestions
for "loo" might be like so

```bash
# Not quite right - just returns docs that have matching suggestions
curl -XGET 'http://localhost:9200/store/clothing/_search?pretty=1' -d '{
  "query":{
    "prefix":{
      "description.suggestions":"loo"
    }
  },
  "fields":["description.suggestions"]
}'
```

This does appropriately leave out the ten gallon hat, but the results are hardly a list of suggestions.
In fact, the suggestions exist only as part of the index, not the document! The way to group
stuff by the suggestions they offer - and get a count as a bonus - is to use _facets_. This really
just means "group by and count".

```bash
curl -XGET 'http://localhost:9200/store/clothing/_search?pretty=1' -d '{
  "query":{
    "prefix":{
      "description.suggestions":"loo"
    }
  },
  "facets":{
    "description_suggestions":{
      "terms":{
        "field":"description.suggestions",
        "regex":"^loo.*",
        "size": 10
      }
    }
  }
}
'
{
  ...
  "facets" : {
    "description_suggestions" : {
      "_type" : "terms",
      "missing" : 0,
      "total" : 255,
      "other" : 243,
      "terms" : [ {
        "term" : "look",
        "count" : 3
      }, {
        "term" : "look like a real biker",
        "count" : 1
      }, {
        "term" : "look like a real",
        "count" : 1
      }, {
        "term" : "look like a",
        "count" : 1
      }, {
        "term" : "look like",
        "count" : 1
      }, {
        "term" : "look absolutely fabulous",
        "count" : 1
      }, {
        "term" : "look absolutely",
        "count" : 1
      }, {
        "term" : "look a little funny with",
        "count" : 1
      }, {
        "term" : "look a little funny",
        "count" : 1
      }, {
        "term" : "look a little",
        "count" : 1
      } ]
    }
  }
}
```

So those results are fairly useful, though you probably want to massage their order. Suggestions welcome!

Others have written about similar uses of Solr and Lucene, and their writing inspired some of this post.
Definitely check them out:

 * http://searchhub.org/dev/2009/09/08/auto-suggest-from-popular-queries-using-edgengrams/
 * http://karussell.wordpress.com/2010/12/08/use-cases-of-faceted-search-for-apache-solr/
