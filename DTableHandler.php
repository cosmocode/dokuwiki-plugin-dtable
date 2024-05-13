<?php

namespace dokuwiki\plugin\dtable;


class DTableHandler extends \Doku_Handler
{
    public $calls;
    public $row = 0;
    public $cell = 0;
    public $type;
    public $file_path;
    public $start_line;

    public function __construct($page_id, $start_line)
    {
        parent::__construct();
        $this->file_path = wikiFN($page_id);
        $this->start_line = $start_line;
    }

    public function table($match, $state, $pos)
    {
        switch ($state) {
            case DOKU_LEXER_ENTER:
                $type = trim($match);

                $this->calls = [];

                $line = \helper_plugin_dtable::line_nr($pos, $this->file_path, $this->start_line);

                $this->calls[$this->row][0][$this->cell] = [1, 1, $type, ''];
                $this->calls[$this->row][1][0] = $line;

                break;

            case DOKU_LEXER_EXIT:
                $line = \helper_plugin_dtable::line_nr($pos, $this->file_path, $this->start_line);
                $this->calls[$this->row][1][1] = $line - 1;


                break;

            case DOKU_LEXER_UNMATCHED:
                if (is_array($this->calls)) {
                    $this->calls[$this->row][0][$this->cell][3] .= $match;
                }
                break;

            case DOKU_LEXER_MATCHED:
                if (preg_match('/:::/', $match)) {
                    $this->calls[$this->row][0][$this->cell][3] .= $match;
                } elseif (trim($match) == '') {
                    $this->calls[$this->row][0][$this->cell][3] .= $match;
                } else {
                    $row = $this->row;
                    while (preg_match('/^\s*:::\s*$/', $this->calls[$row][0][$this->cell][3]) && $row > 0) {
                        $row--;
                    }
                    if ($row != $this->row)
                        $this->calls[$row][0][$this->cell][1]++;

                    if ($match[0] == "\n") {
                        $line = \helper_plugin_dtable::line_nr($pos, $this->file_path, $this->start_line);
                        $this->calls[$this->row][1][1] = $line - 1;

                        //remove last cell and -- the celsapn it doesn't exist
                        array_pop($this->calls[$this->row][0]);

                        $this->row++;
                        $this->calls[$this->row] = [[], []];

                        $this->cell = 0;
                        $type = $match[1];

                        $this->calls[$this->row][1][0] = $line;

                        $this->calls[$this->row][0][$this->cell] = [1, 1, $type, ''];
                    } else {
                        if ($this->calls[$this->row][0][$this->cell][3] == '' && $this->cell > 0) {
                            $this->calls[$this->row][0][$this->cell - 1][0]++;
                            array_pop($this->calls[$this->row][0]);
                        } else {
                            $this->cell++;
                        }
                        $type = $match[0];
                        $this->calls[$this->row][0][$this->cell] = [1, 1, $type, ''];
                    }
                }
                break;
        }
        return true;
    }

    /** Change // into \n during editing in textbox, can be turn off if not needed. */
    public function linebreak($match, $state, $pos)
    {
        $this->calls[$this->row][0][$this->cell][3] .= "\n";
        return true;
    }

    /**
     * Catchall handler for the remaining syntax
     *
     * @param string $name Function name that was called
     * @param array $params Original parameters
     * @return bool If parsing should be continue
     */
    public function __call($name, $params)
    {
        $this->calls[$this->row][0][$this->cell][3] .= $params[0];
        return true;
    }

    /**
     * remove last cell and -- the cellspan it doesn't exist
     */
    public function __finalize()
    {

        array_pop($this->calls[$this->row][0]);
        $this->row = 0;
        $this->cell = 0;
    }
}
