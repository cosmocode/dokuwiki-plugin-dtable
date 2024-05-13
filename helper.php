<?php

use dokuwiki\Parsing\Parser;
use dokuwiki\plugin\dtable\DTableHandler;

/**
 * All DokuWiki plugins to extend the parser/rendering mechanism
 * need to inherit from this class
 */
class helper_plugin_dtable extends dokuwiki_plugin
{
    static $line_nr_c = [];
    static $file_cont;

    /**
     * Get the error message for a given error code
     *
     * @param string $code
     * @param bool $json Return as JSON?
     * @return string
     */
    public function error($code, $json = false)
    {
        if ($json == true) {
            return json_encode([
                'type' => 'error',
                'msg' => $this->getLang($code)
            ]);
        } else {
            return $this->getLang($code);
        }
    }

    /**
     * @fixme describe
     * @param $pos
     * @param $file_path
     * @param $start_line
     * @return mixed
     */
    public static function line_nr($pos, $file_path, $start_line = 0)
    {
        $line_nr = 0;
        if (!is_array(self::$line_nr_c[$file_path])) {
            self::$line_nr_c[$file_path] = [];
            $start_pos = 0;
            $line_nr = 0;
        } else {
            $start_pos = count(self::$line_nr_c[$file_path]) - 1;
            $line_nr = self::$line_nr_c[$file_path][count(self::$line_nr_c[$file_path]) - 1];
        }

        if ($start_line > 0) {
            //find last pos on current line
            if (($find = array_search($start_line, self::$line_nr_c[$file_path])) !== false) {
                //the new line charter from last line -> it's nessesery in order to corect work of my handler
                $start_pos = $find;
                $pos += $find;
            } else {
                if (self::$file_cont == null)
                    self::$file_cont = io_readFile($file_path);

                for ($i = $start_pos; $i < strlen(self::$file_cont) && $line_nr < $start_line; $i++) {
                    self::$line_nr_c[$file_path][$i] = $line_nr;
                    if (self::$file_cont[$i] == "\n")
                        $line_nr++;
                }
                self::$line_nr_c[$file_path][$i] = $line_nr;

                $pos += $i;
                $start_pos = $i;
            }
            $line_nr = $start_line;
        }
        if ($start_pos >= $pos) {
            /*dbglog("TYRANOZAUR");
            dbglog(self::$line_nr_c);*/
            return self::$line_nr_c[$file_path][$pos];
        } else {
            if (self::$file_cont == null)
                self::$file_cont = io_readFile($file_path);

            for ($i = $start_pos; $i <= $pos; $i++) {
                self::$line_nr_c[$file_path][$i] = $line_nr;
                if (self::$file_cont[$i] == "\n")
                    $line_nr++;
            }
            return self::$line_nr_c[$file_path][$pos];
        }
    }

    /**
     * Parse the given row
     *
     * @param string $row
     * @param string $page_id
     * @param int $start_line
     * @return array
     */
    public function rows($row, $page_id, $start_line)
    {
        $Parser = new Parser(new DTableHandler($page_id, $start_line));

        //add modes to parser
        $modes = p_get_parsermodes();
        foreach ($modes as $mode) {
            $Parser->addMode($mode['mode'], $mode['obj']);
        }

        return $Parser->parse($row);
    }

    public function get_spans($start_line, $page_lines, $page_id)
    {
        $table = '';
        for ($i = $start_line; trim($page_lines[$i]) != '</dtable>' && $i < count($page_lines); $i++) {
            $table .= $page_lines[$i] . "\n";
        }

        $spans = [];
        $rows = self::rows($table, $page_id, $start_line);
        $counter = count($rows);
        for ($i = 0; $i < $counter; $i++) {
            $counter = count($rows[$i][0]);
            for ($j = 0; $j < $counter; $j++) {
                $spans[$i][$j][0] = $rows[$i][0][$j][0];
                $spans[$i][$j][1] = $rows[$i][0][$j][1];
            }
        }
        return $spans;
    }

    public function format_row($array_line)
    {
        foreach ($array_line as $cell) {
            if ($cell[0] == 'tableheader_open') {
                $line .= '^' . $cell[1];
            } else {
                $line .= '|' . $cell[1];
            }
        }
        if ($array_line[count($array_line) - 1][0] == 'tableheader_open') {
            $line .= '^';
        } else {
            $line .= '|';
        }
        $line = str_replace("\n", '\\\\ ', $line);

        return $line;
    }

    public function parse_line($line, $page_id)
    {
        $line = preg_replace('/\s*:::\s*\|/', '', $line);


        $info = [];
        $html = p_render('xhtml', p_get_instructions($line), $info);

        $maches = [];

        preg_match('/<tr.*?>(.*?)<\/tr>/si', $html, $maches);

        return trim($maches[1]);
    }
}
