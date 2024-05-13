<?php

use dokuwiki\Extension\SyntaxPlugin;

// must be run within DokuWiki
if (!defined('DOKU_INC')) die();

if (!defined('DOKU_PLUGIN')) define('DOKU_PLUGIN', DOKU_INC . 'lib/plugins/');
require_once DOKU_PLUGIN . 'syntax.php';


/**
 * All DokuWiki plugins to extend the parser/rendering mechanism
 * need to inherit from this class
 */
class syntax_plugin_dtable extends SyntaxPlugin
{
    public function getPType()
    {
        return 'block';
    }

    public function getType()
    {
        return 'container';
    }
    public function getSort()
    {
        return 400;
    }
    public function getAllowedTypes()
    {
        return ['container', 'formatting', 'substition'];
    }

    public function connectTo($mode)
    {
        $this->Lexer->addEntryPattern('<dtab[0-9][0-9]>(?=.*</dtable>)', $mode, 'plugin_dtable');
    }
    public function postConnect()
    {
        $this->Lexer->addExitPattern('</dtable>', 'plugin_dtable');
    }


    public function handle($match, $state, $pos, Doku_Handler $handler)
    {
        global $INFO;
        switch ($state) {
            case DOKU_LEXER_ENTER:
                try {
                    $table_nr = (int) substr($match, 5, 2);
                    return [$state, [$pos, $table_nr, p_get_metadata($INFO['id'], 'dtable_pages')]];
                } catch (Exception $e) {
                    return [$state, false];
                }

            case DOKU_LEXER_UNMATCHED:
                return [$state, $match];
            case DOKU_LEXER_EXIT:
                return [$state, ''];
        }
        return [];
    }

    public function render($mode, Doku_Renderer $renderer, $data)
    {
        global $ID;
        if ($mode == 'xhtml') {
            [$state, $match] = $data;
            switch ($state) {
                case DOKU_LEXER_ENTER:
                    if ($match != false) {
                        if (auth_quickaclcheck($ID) >= AUTH_EDIT) {
                            $dtable =& plugin_load('helper', 'dtable');

                            $pos = $match[0];
                            $table_nr = $match[1];
                            $dtable_pages = $match[2];

                            $id = $dtable_pages[$table_nr];
                            $filepath = wikiFN($id);

                            $start_line = $dtable->line_nr($pos, $filepath) ;

                            //search for first row
                            $file_cont = explode("\n", io_readWikiPage($filepath, $id));

                            $start_line++;

                            $i = $start_line;
                            while (
                                $i <  count($file_cont) &&
                                strpos($file_cont[$i], '|') !== 0 &&
                                strpos($file_cont[$i], '^') !== 0
                            )
                                ++$i;
                            $start_line = $i;


                            $raw_lines = '';

                            while ($i <  count($file_cont) && strpos($file_cont[ $i ], '</dtable>') !== 0) {
                                    $raw_lines .= $file_cont[$i] . "\n";
                                    $i++;
                            }

                            $lines = $dtable->rows($raw_lines, $id, $start_line);

                            $json = new JSON();

                            $renderer->doc .= '<form class="dtable dynamic_form" id="dtable_' . $start_line . '_' . $id . '" action="' . $DOKU_BASE . 'lib/exe/ajax.php" method="post" data-table="' . htmlspecialchars($json->encode($lines)) . '">';
                            $renderer->doc .= '<input type="hidden" class="dtable_field" value="dtable" name="call">';

                            //This is needed to correct linkwiz behaviour.
                            $renderer->doc .= '<input type="hidden" class="dtable_field" value="' . $id . '" name="id">';
                        }
                    }
                    break;

                case DOKU_LEXER_UNMATCHED:
                    $renderer->doc .= $renderer->_xmlEntities($match);
                    break;
                case DOKU_LEXER_EXIT:
                        if (auth_quickaclcheck($ID) >= AUTH_EDIT)
                        $renderer->doc .= "</form>";

                    break;
            }
            return true;
        }
        return false;
    }
}
