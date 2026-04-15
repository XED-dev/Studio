infactory-cli-v2
=================

A new CLI generated with oclif


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/infactory-cli-v2.svg)](https://npmjs.org/package/infactory-cli-v2)
[![Downloads/week](https://img.shields.io/npm/dw/infactory-cli-v2.svg)](https://npmjs.org/package/infactory-cli-v2)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g infactory-cli-v2
$ infactory-cli-v2 COMMAND
running command...
$ infactory-cli-v2 (--version)
infactory-cli-v2/0.0.0 linux-x64 node-v20.17.0
$ infactory-cli-v2 --help [COMMAND]
USAGE
  $ infactory-cli-v2 COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`infactory-cli-v2 hello PERSON`](#infactory-cli-v2-hello-person)
* [`infactory-cli-v2 hello world`](#infactory-cli-v2-hello-world)
* [`infactory-cli-v2 help [COMMAND]`](#infactory-cli-v2-help-command)
* [`infactory-cli-v2 plugins`](#infactory-cli-v2-plugins)
* [`infactory-cli-v2 plugins add PLUGIN`](#infactory-cli-v2-plugins-add-plugin)
* [`infactory-cli-v2 plugins:inspect PLUGIN...`](#infactory-cli-v2-pluginsinspect-plugin)
* [`infactory-cli-v2 plugins install PLUGIN`](#infactory-cli-v2-plugins-install-plugin)
* [`infactory-cli-v2 plugins link PATH`](#infactory-cli-v2-plugins-link-path)
* [`infactory-cli-v2 plugins remove [PLUGIN]`](#infactory-cli-v2-plugins-remove-plugin)
* [`infactory-cli-v2 plugins reset`](#infactory-cli-v2-plugins-reset)
* [`infactory-cli-v2 plugins uninstall [PLUGIN]`](#infactory-cli-v2-plugins-uninstall-plugin)
* [`infactory-cli-v2 plugins unlink [PLUGIN]`](#infactory-cli-v2-plugins-unlink-plugin)
* [`infactory-cli-v2 plugins update`](#infactory-cli-v2-plugins-update)

## `infactory-cli-v2 hello PERSON`

Say hello

```
USAGE
  $ infactory-cli-v2 hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ infactory-cli-v2 hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/XED-Studio/infactory-cli-v2/blob/v0.0.0/src/commands/hello/index.ts)_

## `infactory-cli-v2 hello world`

Say hello world

```
USAGE
  $ infactory-cli-v2 hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ infactory-cli-v2 hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/XED-Studio/infactory-cli-v2/blob/v0.0.0/src/commands/hello/world.ts)_

## `infactory-cli-v2 help [COMMAND]`

Display help for infactory-cli-v2.

```
USAGE
  $ infactory-cli-v2 help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for infactory-cli-v2.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.2.44/src/commands/help.ts)_

## `infactory-cli-v2 plugins`

List installed plugins.

```
USAGE
  $ infactory-cli-v2 plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ infactory-cli-v2 plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.60/src/commands/plugins/index.ts)_

## `infactory-cli-v2 plugins add PLUGIN`

Installs a plugin into infactory-cli-v2.

```
USAGE
  $ infactory-cli-v2 plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into infactory-cli-v2.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the INFACTORY_CLI_V2_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the INFACTORY_CLI_V2_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ infactory-cli-v2 plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ infactory-cli-v2 plugins add myplugin

  Install a plugin from a github url.

    $ infactory-cli-v2 plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ infactory-cli-v2 plugins add someuser/someplugin
```

## `infactory-cli-v2 plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ infactory-cli-v2 plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ infactory-cli-v2 plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.60/src/commands/plugins/inspect.ts)_

## `infactory-cli-v2 plugins install PLUGIN`

Installs a plugin into infactory-cli-v2.

```
USAGE
  $ infactory-cli-v2 plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into infactory-cli-v2.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the INFACTORY_CLI_V2_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the INFACTORY_CLI_V2_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ infactory-cli-v2 plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ infactory-cli-v2 plugins install myplugin

  Install a plugin from a github url.

    $ infactory-cli-v2 plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ infactory-cli-v2 plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.60/src/commands/plugins/install.ts)_

## `infactory-cli-v2 plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ infactory-cli-v2 plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ infactory-cli-v2 plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.60/src/commands/plugins/link.ts)_

## `infactory-cli-v2 plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ infactory-cli-v2 plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ infactory-cli-v2 plugins unlink
  $ infactory-cli-v2 plugins remove

EXAMPLES
  $ infactory-cli-v2 plugins remove myplugin
```

## `infactory-cli-v2 plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ infactory-cli-v2 plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.60/src/commands/plugins/reset.ts)_

## `infactory-cli-v2 plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ infactory-cli-v2 plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ infactory-cli-v2 plugins unlink
  $ infactory-cli-v2 plugins remove

EXAMPLES
  $ infactory-cli-v2 plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.60/src/commands/plugins/uninstall.ts)_

## `infactory-cli-v2 plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ infactory-cli-v2 plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ infactory-cli-v2 plugins unlink
  $ infactory-cli-v2 plugins remove

EXAMPLES
  $ infactory-cli-v2 plugins unlink myplugin
```

## `infactory-cli-v2 plugins update`

Update installed plugins.

```
USAGE
  $ infactory-cli-v2 plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.60/src/commands/plugins/update.ts)_
<!-- commandsstop -->
